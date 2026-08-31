
from pathlib import Path
import shutil,tempfile,os,io
from fastapi import FastAPI,UploadFile,File,Form,HTTPException,Request,Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse,JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pypdf import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from .models import *
from .vision import analyze_image
from .engine import diagnose as run_diagnose
from .authdb import *
from .config import settings
from .migrate import run as run_migrations
from .blobstore import save_bytes,delete_prefix
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .mailer import send_password_reset
from .repository import backend_name,connect

if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=settings.sentry_dsn,traces_sample_rate=0.05,environment=settings.env)
run_migrations()
limiter=Limiter(key_func=get_remote_address,default_limits=[settings.rate_limit])
app=FastAPI(title="RepairPilot API",version="0.9.0")
app.state.limiter=limiter
app.add_exception_handler(RateLimitExceeded,_rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware,allow_origins=settings.allowed_origins,allow_credentials=True,allow_methods=["GET","POST","PATCH"],allow_headers=["Authorization","Content-Type"])

bearer_scheme=HTTPBearer(auto_error=False)

def user_from_credentials(credentials:HTTPAuthorizationCredentials|None,admin=False):
    if not credentials or credentials.scheme.lower()!="bearer":
        raise HTTPException(401,"Authentication required.")
    claims=decode_token(credentials.credentials)
    if not claims: raise HTTPException(401,"Invalid or expired token.")
    account=get_user_by_id(claims.get("sub"))
    if not account: raise HTTPException(401,"Account no longer exists.")
    if int(claims.get("ver",0) or 0)!=int(account.get("token_version",0) or 0):
        raise HTTPException(401,"Session has been invalidated. Please log in again.")
    # Role and email come from the database, not stale JWT claims. This makes
    # account deletion and role changes effective immediately.
    u={"sub":account["id"],"email":account["email"],"role":account.get("role","tester")}
    if admin and u.get("role")!="admin": raise HTTPException(403,"Admin access required.")
    return u

def current_user(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    return user_from_credentials(credentials)

def current_admin(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    return user_from_credentials(credentials,admin=True)

@app.get("/health")
def health(): return {"ok":True,"mode":"ai" if os.getenv("OPENAI_API_KEY") else "demo","version":"0.9.0","env":settings.env,"storage":settings.storage_backend,"database":backend_name()}

@app.post("/auth/register")
def register(payload:dict):
    email=str(payload.get("email","")).strip(); password=str(payload.get("password","")); invite=str(payload.get("invite_code","")).strip()
    if "@" not in email or len(password)<8: raise HTTPException(400,"Valid email and password of at least 8 characters required.")
    user,reason=register_user_with_invite(email,password,invite,"tester")
    if reason=="invite": raise HTTPException(403,"Valid beta invite code required.")
    if reason=="exists": raise HTTPException(409,"Account already exists.")
    return {"token":token_for(user),"user":user}

@app.post("/auth/login")
def login(payload:dict):
    user=verify(str(payload.get("email","")),str(payload.get("password","")))
    if not user: raise HTTPException(401,"Invalid email or password.")
    return {"token":token_for(user),"user":{"id":user["id"],"email":user["email"],"role":user.get("role","tester")}}


@app.post("/auth/password-reset/request")
def password_reset_request(payload:dict):
    email=str(payload.get("email","")).strip().lower()
    token=create_password_reset(email)
    out={"ok":True,"message":"If that account exists, reset instructions can be sent."}
    if token:
        try:
            delivery=send_password_reset(email,token)
            if settings.env!="production" and delivery.get("development_link"):
                out["development_reset_link"]=delivery["development_link"]
        except Exception:
            if settings.env!="production": out["development_reset_token"]=token
    return out

@app.post("/auth/password-reset/confirm")
def password_reset_confirm(payload:dict):
    password=str(payload.get("new_password",""))
    if len(password)<8: raise HTTPException(400,"Password must be at least 8 characters.")
    if not consume_password_reset(str(payload.get("token","")),password):
        raise HTTPException(400,"Invalid or expired reset token.")
    return {"ok":True}

@app.get("/auth/me")
def me(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return {"id":u["sub"],"email":u.get("email"),"role":u.get("role","tester")}

@app.post("/admin/invites")
def create_beta_invite(payload:dict,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials,admin=True)
    return create_invite(u["sub"],max(1,min(100,int(payload.get("max_uses",1)))))

@app.get("/admin/invites")
def get_invites(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials,admin=True); return list_invites()

@app.get("/equipment")
def equipment(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return list_equipment(u["sub"])

@app.post("/equipment")
def create_equipment(profile:EquipmentProfile,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); out=add_equipment(u["sub"],profile.model_dump()); audit(u["sub"],"equipment.created","equipment",out["id"],{"name":out["name"]}); return out

@app.patch("/equipment/{equipment_id}")
def patch_equipment(equipment_id:str,payload:dict,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); out=update_equipment(u["sub"],equipment_id,payload)
    if not out: raise HTTPException(404,"Equipment not found.")
    return out

@app.get("/repairs")
def repairs(equipment_id:str|None=None,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return list_repairs(u["sub"],equipment_id)

@app.post("/repairs")
def create_repair(payload:dict,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    equipment_id=payload.get("equipment_id")
    if equipment_id and not get_equipment(u["sub"],str(equipment_id)):
        raise HTTPException(404,"Equipment not found.")
    outcome=str(payload.get("outcome","fixed" if payload.get("fix") and payload.get("fix")!="Unresolved" else "needs_work"))
    if outcome not in {"fixed","needs_work"}:
        raise HTTPException(400,"Outcome must be fixed or needs_work.")
    payload={**payload,"outcome":outcome}
    out=add_repair(u["sub"],payload)
    mark_diagnostic_outcome(u["sub"],payload.get("session_id"),outcome)
    audit(u["sub"],"repair.saved","repair",out["id"],{"equipment_id":payload.get("equipment_id"),"fix":payload.get("fix","")}); return out

@app.get("/repairs/{repair_id}/report.pdf")
def repair_report(repair_id:str,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    r=get_repair(u["sub"],repair_id)
    if not r: raise HTTPException(404,"Repair not found.")
    buf=io.BytesIO()
    c=canvas.Canvas(buf,pagesize=letter)
    width,height=letter
    y=height-50
    c.setFont("Helvetica-Bold",18); c.drawString(50,y,"RepairPilot Repair Report"); y-=30
    c.setFont("Helvetica",11)
    fields=[("Equipment",r.get("equipment_name","")),("Symptom",r.get("symptom","")),("Fix",r.get("fix","")),("Part",r.get("part","")),("Notes",r.get("notes",""))]
    for label,val in fields:
        c.setFont("Helvetica-Bold",11); c.drawString(50,y,label+":")
        c.setFont("Helvetica",11)
        for line in str(val or "").splitlines() or [""]:
            c.drawString(130,y,line[:95]); y-=16
            if y<80: c.showPage(); y=height-50
        y-=4
    y-=8; c.setFont("Helvetica-Bold",12); c.drawString(50,y,"Diagnostic History"); y-=20
    c.setFont("Helvetica",10)
    for i,h in enumerate(r.get("history",[]),1):
        q=f"{i}. {h.get('question','')}"
        a=f"Answer: {h.get('answer','')}  Risk: {h.get('risk','')}"
        for txt in (q,a):
            c.drawString(50,y,txt[:105]); y-=14
            if y<80: c.showPage(); y=height-50
        y-=4
    c.save(); buf.seek(0)
    return StreamingResponse(buf,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="repairpilot_{repair_id}.pdf"'})


async def read_capped(file:UploadFile,max_bytes:int)->bytes:
    data=await file.read(max_bytes+1)
    if len(data)>max_bytes: raise HTTPException(413,"Upload exceeds configured size limit.")
    return data

@app.post("/photos/analyze")
@limiter.limit("20/minute")
async def photo_analyze(request:Request,equipment_id:str=Form(...),file:UploadFile=File(...),credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if not get_equipment(u["sub"],equipment_id): raise HTTPException(404,"Equipment not found.")
    if not (file.content_type or "").startswith("image/"): raise HTTPException(400,"Upload an image file.")
    data=await read_capped(file,settings.max_image_mb*1024*1024)
    blob=save_bytes(u["sub"],"images",file.filename or "image.jpg",data,file.content_type or "image/jpeg")
    add_blob_record(u["sub"],equipment_id,"image",file.filename or "image.jpg",file.content_type or "image/jpeg",blob)
    with tempfile.NamedTemporaryFile(delete=False,suffix=Path(file.filename or "image.jpg").suffix) as tmp:
        tmp.write(data); temp=Path(tmp.name)
    try:
        result=analyze_image(temp,file.filename or "image.jpg","temp")
        iid=add_image(u["sub"],equipment_id,file.filename or "image.jpg",result.description,result.model_dump())
        result.upload_id=iid
        audit(u["sub"],"photo.analyzed","image",iid,{"equipment_id":equipment_id,"filename":file.filename or "image.jpg","confidence":result.confidence})
        return result
    finally: temp.unlink(missing_ok=True)

@app.get("/equipment/{equipment_id}/images")
def images(equipment_id:str,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if not get_equipment(u["sub"],equipment_id): raise HTTPException(404,"Equipment not found.")
    return list_images(u["sub"],equipment_id)

@app.post("/manuals/upload")
@limiter.limit("10/minute")
async def manual_upload(request:Request,equipment_id:str=Form(...),file:UploadFile=File(...),credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if not get_equipment(u["sub"],equipment_id): raise HTTPException(404,"Equipment not found.")
    if not (file.filename or "").lower().endswith(".pdf"): raise HTTPException(400,"PDF required.")
    data=await read_capped(file,settings.max_pdf_mb*1024*1024)
    blob=save_bytes(u["sub"],"manuals",file.filename or "manual.pdf",data,"application/pdf")
    add_blob_record(u["sub"],equipment_id,"manual",file.filename or "manual.pdf","application/pdf",blob)
    with tempfile.NamedTemporaryFile(delete=False,suffix=".pdf") as tmp:
        tmp.write(data); path=Path(tmp.name)
    try:
        reader=PdfReader(str(path)); pages=[]
        for i,p in enumerate(reader.pages):
            txt=(p.extract_text() or "").strip()
            if txt: pages.append({"page":i+1,"text":txt[:30000]})
        out=save_manual(u["sub"],equipment_id,file.filename or "manual.pdf",pages)
        audit(u["sub"],"manual.indexed","manual",out["id"],{"equipment_id":equipment_id,"pages":len(pages)})
        return out
    finally:path.unlink(missing_ok=True)

@app.get("/equipment/{equipment_id}/manuals")
def manuals(equipment_id:str,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if not get_equipment(u["sub"],equipment_id): raise HTTPException(404,"Equipment not found.")
    return list_manuals(u["sub"],equipment_id)

@app.get("/manuals/search")
def manual_search_route(equipment_id:str,q:str,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if not get_equipment(u["sub"],equipment_id): raise HTTPException(404,"Equipment not found.")
    return search_manual(u["sub"],equipment_id,q)

@app.post("/diagnose",response_model=DiagnoseResponse)
@limiter.limit("30/minute")
def diagnose(request:Request,req:DiagnoseRequest,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    if req.equipment_profile.id:
        stored=get_equipment(u["sub"],req.equipment_profile.id)
        if not stored: raise HTTPException(404,"Equipment not found.")
        # The database profile is authoritative; do not let a client spoof model details
        # while referencing an existing equipment id.
        req.equipment_profile=EquipmentProfile(**stored)
    query=req.symptom+" "+" ".join(x.answer for x in req.history[-3:])
    manual=search_manual(u["sub"],req.equipment_profile.id,query) if req.equipment_profile.id else []
    resp=run_diagnose(req,manual)
    sid=save_diagnostic_session(u["sub"],req.equipment_profile.id,req.symptom,req.model_dump(),resp.model_dump(),req.session_id)
    resp.session_id=sid
    audit(u["sub"],"diagnosis.step","equipment",req.equipment_profile.id or "",{"session_id":sid,"risk":resp.risk.level,"status":resp.status,"history_count":len(req.history)})
    if resp.status=="escalate" or resp.risk.level=="red":
        enqueue_review(u["sub"],req.equipment_profile.id,{"request":req.model_dump(),"response":resp.model_dump()},resp.risk.level)
    return resp

@app.get("/reviews")
def reviews(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return list_reviews_for_user(u["sub"])

@app.get("/admin/reviews")
def admin_reviews(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    user_from_credentials(credentials,admin=True); return list_reviews_all()

@app.post("/admin/reviews/{review_id}/close")
def review_close(review_id:str,payload:dict,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    user_from_credentials(credentials,admin=True); return close_review(review_id,str(payload.get("note",""))[:4000])

@app.post("/feedback")
def feedback(payload:dict,credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    session_id=str(payload.get("session_id","")).strip()
    if session_id and not diagnostic_session_belongs_to_user(u["sub"],session_id):
        raise HTTPException(404,"Diagnostic session not found.")
    rating=max(1,min(5,int(payload.get("rating",3))))
    return add_feedback(u["sub"],session_id,rating,bool(payload.get("success",False)),str(payload.get("comment",""))[:2000])

@app.get("/analytics")
def analytics(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return feedback_stats(u["sub"])


@app.get("/audit")
def my_audit(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials); return audit_recent(u["sub"],100)

@app.get("/admin/audit")
def admin_audit(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    user_from_credentials(credentials,admin=True); return audit_recent(None,200)


@app.get("/account/export")
def account_export(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    audit(u["sub"],"account.exported","user",u["sub"],{})
    return export_user_data(u["sub"])

@app.delete("/account")
def account_delete(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    u=user_from_credentials(credentials)
    storage_result=delete_prefix(u["sub"])
    delete_user_data(u["sub"])
    return {"ok":True,"storage_cleanup":storage_result}

@app.get("/admin/metrics")
def metrics(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme)):
    user_from_credentials(credentials,admin=True)
    return admin_metrics()


@app.get("/ready")
def ready():
    db_ok=False
    try:
        with connect() as c:
            c.execute("SELECT 1").fetchone()
        db_ok=True
    except Exception:
        db_ok=False
    storage_configured=(settings.storage_backend!="supabase" or bool(settings.supabase_url and settings.supabase_service_key))
    payload={
        "ok":db_ok and storage_configured,
        "environment":settings.env,
        "database":backend_name(),
        "database_reachable":db_ok,
        "storage":settings.storage_backend,
        "storage_configured":storage_configured,
        "ai_configured":bool(os.getenv("OPENAI_API_KEY")),
        "error_reporting":bool(settings.sentry_dsn)
    }
    return JSONResponse(status_code=200 if payload["ok"] else 503,content=payload)


@app.get("/admin/unresolved")
def unresolved(credentials:HTTPAuthorizationCredentials|None=Depends(bearer_scheme),limit:int=100):
    user_from_credentials(credentials,admin=True)
    return list_unresolved(max(1,min(limit,500)))
