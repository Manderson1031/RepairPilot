
from pathlib import Path
import sqlite3, uuid, os, time, json, secrets
from .repository import connect, backend_name, integrity_errors
import hashlib, hmac, base64
import jwt

SECRET=os.getenv("REPAIRPILOT_SECRET","dev-only-change-me")
ALG="HS256"

def hash_password(password:str)->str:
    salt=os.urandom(16)
    rounds=310000
    dk=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,rounds)
    return f"pbkdf2_sha256${rounds}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(dk).decode()}"

def verify_password(password:str,stored:str)->bool:
    try:
        scheme,rounds_s,salt_b64,hash_b64=stored.split("$",3)
        if scheme!="pbkdf2_sha256": return False
        salt=base64.urlsafe_b64decode(salt_b64.encode())
        expected=base64.urlsafe_b64decode(hash_b64.encode())
        actual=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,int(rounds_s))
        return hmac.compare_digest(actual,expected)
    except Exception:
        return False


def init():
    if backend_name()=="postgres":
        schema=Path(__file__).resolve().parents[1]/"postgres"/"schema.sql"
        with connect() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
        return

    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT DEFAULT 'tester',created INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS invite_codes(
          code TEXT PRIMARY KEY,created_by TEXT,max_uses INTEGER,uses INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS equipment_v2(
          id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,manufacturer TEXT,model TEXT,serial TEXT,category TEXT,notes TEXT,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS repairs_v2(
          id TEXT PRIMARY KEY,user_id TEXT NOT NULL,equipment_id TEXT,equipment_name TEXT,symptom TEXT,history_json TEXT,fix TEXT,part TEXT,notes TEXT,saved INTEGER,updated INTEGER
        );
        CREATE TABLE IF NOT EXISTS manuals_v2(
          id TEXT PRIMARY KEY,user_id TEXT NOT NULL,equipment_id TEXT NOT NULL,name TEXT NOT NULL,pages_json TEXT NOT NULL,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS image_history(
          id TEXT PRIMARY KEY,user_id TEXT,equipment_id TEXT,filename TEXT,description TEXT,analysis_json TEXT,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS feedback(
          id TEXT PRIMARY KEY,user_id TEXT,session_id TEXT,rating INTEGER,success INTEGER,comment TEXT,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS review_queue(
          id TEXT PRIMARY KEY,user_id TEXT,equipment_id TEXT,session_json TEXT,risk_level TEXT,status TEXT,review_note TEXT,created INTEGER,updated INTEGER
        );
        CREATE TABLE IF NOT EXISTS audit_log(
          id TEXT PRIMARY KEY,user_id TEXT,event TEXT,entity_type TEXT,entity_id TEXT,detail_json TEXT,created INTEGER
        );
        CREATE TABLE IF NOT EXISTS password_reset_tokens(
          token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER DEFAULT 0,created INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS blobs(
          id TEXT PRIMARY KEY,user_id TEXT NOT NULL,equipment_id TEXT,category TEXT NOT NULL,filename TEXT NOT NULL,
          content_type TEXT,backend TEXT NOT NULL,object_path TEXT NOT NULL,created INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS diagnostic_sessions(
          id TEXT PRIMARY KEY,user_id TEXT NOT NULL,equipment_id TEXT,symptom TEXT,status TEXT,risk_level TEXT,
          request_json TEXT,response_json TEXT,outcome TEXT DEFAULT '',created INTEGER,updated INTEGER
        );
        CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied INTEGER);
        """)
        cols=[r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()]
        if "role" not in cols:
            c.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'tester'")
init()

def create_user(email,password,role="tester"):
    uid=str(uuid.uuid4())
    try:
        with connect() as c:
            c.execute("INSERT INTO users(id,email,password_hash,role,created) VALUES(?,?,?,?,?)",
                      (uid,email.lower().strip(),hash_password(password),role,int(time.time())))
        return {"id":uid,"email":email.lower().strip(),"role":role}
    except integrity_errors():
        return None

def verify(email,password):
    with connect() as c:
        row=c.execute("SELECT * FROM users WHERE email=?",(email.lower().strip(),)).fetchone()
    if not row or not verify_password(password,row["password_hash"]): return None
    return dict(row)

def token_for(user):
    return jwt.encode({"sub":user["id"],"email":user["email"],"role":user.get("role","tester"),"exp":int(time.time())+60*60*24*30},SECRET,algorithm=ALG)

def decode_token(token):
    try:return jwt.decode(token,SECRET,algorithms=[ALG])
    except jwt.PyJWTError:return None

def create_invite(created_by,max_uses=1):
    code="RP-"+secrets.token_hex(4).upper()
    with connect() as c:
        c.execute("INSERT INTO invite_codes(code,created_by,max_uses,uses,active,created) VALUES(?,?,?,?,?,?)",
                  (code,created_by,max_uses,0,1,int(time.time())))
    return {"code":code,"max_uses":max_uses}

def consume_invite(code):
    with connect() as c:
        row=c.execute("SELECT * FROM invite_codes WHERE code=? AND active=1",(code.strip().upper(),)).fetchone()
        if not row or row["uses"]>=row["max_uses"]: return False
        uses=row["uses"]+1
        active=0 if uses>=row["max_uses"] else 1
        c.execute("UPDATE invite_codes SET uses=?,active=? WHERE code=?",(uses,active,row["code"]))
    return True

def list_invites(created_by=None):
    with connect() as c:
        if created_by:
            rows=c.execute("SELECT * FROM invite_codes WHERE created_by=? ORDER BY created DESC",(created_by,)).fetchall()
        else:
            rows=c.execute("SELECT * FROM invite_codes ORDER BY created DESC").fetchall()
    return [dict(r) for r in rows]

def add_equipment(user_id,d):
    eid=str(uuid.uuid4()); now=int(time.time())
    with connect() as c:
        c.execute("""INSERT INTO equipment_v2(id,user_id,name,manufacturer,model,serial,category,notes,created)
                     VALUES(?,?,?,?,?,?,?,?,?)""",(eid,user_id,d.get("name",""),d.get("manufacturer",""),d.get("model",""),
                     d.get("serial",""),d.get("category",""),d.get("notes",""),now))
    return get_equipment(user_id,eid)

def list_equipment(user_id):
    with connect() as c:
        rows=c.execute("SELECT * FROM equipment_v2 WHERE user_id=? ORDER BY created DESC",(user_id,)).fetchall()
    return [dict(r) for r in rows]

def get_equipment(user_id,eid):
    with connect() as c:
        r=c.execute("SELECT * FROM equipment_v2 WHERE id=? AND user_id=?",(eid,user_id)).fetchone()
    return dict(r) if r else None

def update_equipment(user_id,eid,d):
    cur=get_equipment(user_id,eid)
    if not cur:return None
    merged={**cur,**d}
    with connect() as c:
        c.execute("""UPDATE equipment_v2 SET name=?,manufacturer=?,model=?,serial=?,category=?,notes=? WHERE id=? AND user_id=?""",
        (merged["name"],merged.get("manufacturer",""),merged.get("model",""),merged.get("serial",""),merged.get("category",""),merged.get("notes",""),eid,user_id))
    return get_equipment(user_id,eid)

def add_repair(user_id,d):
    rid=str(uuid.uuid4()); now=int(time.time())
    with connect() as c:
        c.execute("""INSERT INTO repairs_v2 VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (rid,user_id,d.get("equipment_id"),d.get("equipment_name",""),d.get("symptom",""),
         json.dumps(d.get("history",[])),d.get("fix",""),d.get("part",""),d.get("notes",""),now,now))
    return {"id":rid}

def list_repairs(user_id,equipment_id=None):
    with connect() as c:
        if equipment_id:
            rows=c.execute("SELECT * FROM repairs_v2 WHERE user_id=? AND equipment_id=? ORDER BY saved DESC",(user_id,equipment_id)).fetchall()
        else:
            rows=c.execute("SELECT * FROM repairs_v2 WHERE user_id=? ORDER BY saved DESC",(user_id,)).fetchall()
    out=[]
    for r in rows:
        d=dict(r); d["history"]=json.loads(d.pop("history_json") or "[]"); out.append(d)
    return out

def get_repair(user_id,repair_id):
    with connect() as c:
        r=c.execute("SELECT * FROM repairs_v2 WHERE user_id=? AND id=?",(user_id,repair_id)).fetchone()
    if not r:return None
    d=dict(r); d["history"]=json.loads(d.pop("history_json") or "[]"); return d

def save_manual(user_id,equipment_id,name,pages):
    mid=str(uuid.uuid4())
    with connect() as c:
        c.execute("INSERT INTO manuals_v2 VALUES(?,?,?,?,?,?)",(mid,user_id,equipment_id,name,json.dumps(pages),int(time.time())))
    return {"id":mid,"equipment_id":equipment_id,"name":name,"pages_parsed":len(pages)}

def list_manuals(user_id,equipment_id):
    with connect() as c:
        rows=c.execute("SELECT id,name,created FROM manuals_v2 WHERE user_id=? AND equipment_id=? ORDER BY created DESC",
                       (user_id,equipment_id)).fetchall()
    return [dict(r) for r in rows]

def search_manual(user_id,equipment_id,query,limit=5):
    import math,re
    with connect() as c:
        rows=c.execute("SELECT * FROM manuals_v2 WHERE user_id=? AND equipment_id=?",(user_id,equipment_id)).fetchall()

    docs=[]
    for row in rows:
        for p in json.loads(row["pages_json"] or "[]"):
            text=p.get("text") or ""
            tokens=re.findall(r"[a-z0-9]+",text.lower())
            docs.append({"manual":row["name"],"page":p["page"],"text":text,"tokens":tokens})

    if not docs:return []
    qterms=[x for x in re.findall(r"[a-z0-9]+",query.lower()) if len(x)>2]
    if not qterms:return []

    N=len(docs)
    avgdl=sum(len(d["tokens"]) for d in docs)/max(N,1)
    df={t:sum(1 for d in docs if t in set(d["tokens"])) for t in set(qterms)}
    k1,b=1.5,.75
    scored=[]
    phrase=query.lower().strip()

    for d in docs:
        dl=len(d["tokens"]) or 1
        counts={}
        for t in d["tokens"]:counts[t]=counts.get(t,0)+1
        score=0.0
        for t in qterms:
            n=df.get(t,0)
            if not n:continue
            idf=math.log(1+(N-n+0.5)/(n+0.5))
            tf=counts.get(t,0)
            score += idf*((tf*(k1+1))/(tf+k1*(1-b+b*dl/max(avgdl,1))))
        low=d["text"].lower()
        if phrase and phrase in low: score += 4.0
        # boost pages containing several unique query terms
        overlap=len(set(qterms)&set(d["tokens"]))
        score += overlap*.25
        if score>0:
            scored.append((score,{"manual":d["manual"],"page":d["page"],"text":d["text"][:4500],"score":round(score,3)}))
    scored.sort(key=lambda x:x[0],reverse=True)
    return [x[1] for x in scored[:limit]]

def add_image(user_id,equipment_id,filename,description,analysis):
    iid=str(uuid.uuid4())
    with connect() as c:
        c.execute("INSERT INTO image_history VALUES(?,?,?,?,?,?,?)",(iid,user_id,equipment_id,filename,description,json.dumps(analysis),int(time.time())))
    return iid

def list_images(user_id,equipment_id):
    with connect() as c:
        rows=c.execute("SELECT * FROM image_history WHERE user_id=? AND equipment_id=? ORDER BY created DESC",(user_id,equipment_id)).fetchall()
    out=[]
    for r in rows:
        d=dict(r); d["analysis"]=json.loads(d.pop("analysis_json") or "{}"); out.append(d)
    return out

def add_feedback(user_id,session_id,rating,success,comment):
    fid=str(uuid.uuid4())
    with connect() as c:c.execute("INSERT INTO feedback VALUES(?,?,?,?,?,?,?)",(fid,user_id,session_id,rating,1 if success else 0,comment,int(time.time())))
    return {"id":fid}

def feedback_stats(user_id=None):
    q="SELECT COUNT(*) n, AVG(rating) rating, AVG(success) success FROM feedback"; args=()
    if user_id:q+=" WHERE user_id=?";args=(user_id,)
    with connect() as c:r=c.execute(q,args).fetchone()
    return {"responses":r["n"] or 0,"average_rating":round(r["rating"] or 0,2),"repair_success_rate":round((r["success"] or 0)*100,1)}

def enqueue_review(user_id,equipment_id,session,risk_level):
    rid=str(uuid.uuid4()); now=int(time.time())
    with connect() as c:
        c.execute("INSERT INTO review_queue VALUES(?,?,?,?,?,?,?,?,?)",(rid,user_id,equipment_id,json.dumps(session),risk_level,"open","",now,now))
    return {"id":rid,"status":"open"}

def list_reviews_for_user(user_id):
    with connect() as c:
        rows=c.execute("SELECT * FROM review_queue WHERE user_id=? ORDER BY created DESC",(user_id,)).fetchall()
    return _reviews(rows)

def list_reviews_all():
    with connect() as c:
        rows=c.execute("SELECT * FROM review_queue ORDER BY created DESC").fetchall()
    return _reviews(rows)

def _reviews(rows):
    out=[]
    for r in rows:
        d=dict(r); d["session"]=json.loads(d.pop("session_json") or "{}"); out.append(d)
    return out

def close_review(review_id,note):
    with connect() as c:
        c.execute("UPDATE review_queue SET status='closed',review_note=?,updated=? WHERE id=?",(note,int(time.time()),review_id))
    return {"id":review_id,"status":"closed","review_note":note}


def audit(user_id,event,entity_type="",entity_id="",detail=None):
    aid=str(uuid.uuid4())
    with connect() as c:
        c.execute("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?)",
                  (aid,user_id,event,entity_type,entity_id,json.dumps(detail or {}),int(time.time())))
    return aid

def audit_recent(user_id=None,limit=100):
    with connect() as c:
        if user_id:
            rows=c.execute("SELECT * FROM audit_log WHERE user_id=? ORDER BY created DESC LIMIT ?",(user_id,limit)).fetchall()
        else:
            rows=c.execute("SELECT * FROM audit_log ORDER BY created DESC LIMIT ?",(limit,)).fetchall()
    out=[]
    for r in rows:
        d=dict(r); d["detail"]=json.loads(d.pop("detail_json") or "{}"); out.append(d)
    return out


def create_password_reset(email):
    import secrets
    with connect() as c:
        row=c.execute("SELECT id FROM users WHERE email=?",(email.lower().strip(),)).fetchone()
        if not row:return None
        token=secrets.token_urlsafe(32)
        c.execute("INSERT INTO password_reset_tokens(token,user_id,expires,used,created) VALUES(?,?,?,?,?)",
                  (token,row["id"],int(time.time())+1800,0,int(time.time())))
    return token

def consume_password_reset(token,new_password):
    with connect() as c:
        row=c.execute("SELECT * FROM password_reset_tokens WHERE token=? AND used=0",(token,)).fetchone()
        if not row or row["expires"]<int(time.time()):return False
        c.execute("UPDATE users SET password_hash=? WHERE id=?",(PWD.hash(new_password),row["user_id"]))
        c.execute("UPDATE password_reset_tokens SET used=1 WHERE token=?",(token,))
    return True

def add_blob_record(user_id,equipment_id,category,filename,content_type,blob):
    bid=str(uuid.uuid4())
    with connect() as c:
        c.execute("INSERT INTO blobs VALUES(?,?,?,?,?,?,?,?,?)",
                  (bid,user_id,equipment_id,category,filename,content_type,blob["backend"],blob["path"],int(time.time())))
    return {"id":bid,**blob}


def export_user_data(user_id):
    with connect() as c:
        user=c.execute("SELECT id,email,role,created FROM users WHERE id=?",(user_id,)).fetchone()
        equipment=[dict(r) for r in c.execute("SELECT * FROM equipment_v2 WHERE user_id=?",(user_id,)).fetchall()]
        repairs=[]
        for r in c.execute("SELECT * FROM repairs_v2 WHERE user_id=?",(user_id,)).fetchall():
            d=dict(r); d["history"]=json.loads(d.pop("history_json") or "[]"); repairs.append(d)
        manuals=[{"id":r["id"],"equipment_id":r["equipment_id"],"name":r["name"],"created":r["created"]}
                 for r in c.execute("SELECT id,equipment_id,name,created FROM manuals_v2 WHERE user_id=?",(user_id,)).fetchall()]
        images=[]
        for r in c.execute("SELECT * FROM image_history WHERE user_id=?",(user_id,)).fetchall():
            d=dict(r); d["analysis"]=json.loads(d.pop("analysis_json") or "{}"); images.append(d)
        feedback=[dict(r) for r in c.execute("SELECT * FROM feedback WHERE user_id=?",(user_id,)).fetchall()]
        reviews=[]
        for r in c.execute("SELECT * FROM review_queue WHERE user_id=?",(user_id,)).fetchall():
            d=dict(r); d["session"]=json.loads(d.pop("session_json") or "{}"); reviews.append(d)
        diagnostics=[]
        for r in c.execute("SELECT * FROM diagnostic_sessions WHERE user_id=?",(user_id,)).fetchall():
            d=dict(r); d["request"]=json.loads(d.pop("request_json") or "{}"); d["response"]=json.loads(d.pop("response_json") or "{}"); diagnostics.append(d)
        audits=[]
        for r in c.execute("SELECT * FROM audit_log WHERE user_id=?",(user_id,)).fetchall():
            d=dict(r); d["detail"]=json.loads(d.pop("detail_json") or "{}"); audits.append(d)
    return {"user":dict(user) if user else None,"equipment":equipment,"repairs":repairs,"manuals":manuals,
            "images":images,"feedback":feedback,"reviews":reviews,"diagnostic_sessions":diagnostics,"audit":audits}

def delete_user_data(user_id):
    with connect() as c:
        for table in ["equipment_v2","repairs_v2","manuals_v2","image_history","feedback","review_queue","audit_log","diagnostic_sessions","blobs"]:
            c.execute(f"DELETE FROM {table} WHERE user_id=?",(user_id,))
        c.execute("DELETE FROM password_reset_tokens WHERE user_id=?",(user_id,))
        c.execute("DELETE FROM users WHERE id=?",(user_id,))
    return True

def admin_metrics():
    with connect() as c:
        users=c.execute("SELECT COUNT(*) n FROM users WHERE role='tester'").fetchone()["n"]
        equipment=c.execute("SELECT COUNT(*) n FROM equipment_v2").fetchone()["n"]
        repairs=c.execute("SELECT COUNT(*) n FROM repairs_v2").fetchone()["n"]
        reviews_open=c.execute("SELECT COUNT(*) n FROM review_queue WHERE status='open'").fetchone()["n"]
        feedback_n=c.execute("SELECT COUNT(*) n FROM feedback").fetchone()["n"]
        rating=c.execute("SELECT AVG(rating) v FROM feedback").fetchone()["v"] or 0
        success=c.execute("SELECT AVG(success) v FROM feedback").fetchone()["v"] or 0
    out={
        "testers":users,"equipment_profiles":equipment,"saved_repairs":repairs,"open_reviews":reviews_open,
        "feedback_responses":feedback_n,"average_rating":round(rating,2),"repair_success_rate":round(success*100,1)
    }
    out.update(diagnostic_metrics())
    return out


def user_email_by_id(user_id):
    with connect() as c:
        r=c.execute("SELECT email FROM users WHERE id=?",(user_id,)).fetchone()
    return r["email"] if r else None


def save_diagnostic_session(user_id,equipment_id,symptom,request_data,response_data,session_id=None):
    sid=session_id or str(uuid.uuid4()); now=int(time.time())
    status=response_data.get("status","ask")
    risk=(response_data.get("risk") or {}).get("level","green")
    with connect() as c:
        existing=c.execute("SELECT id FROM diagnostic_sessions WHERE id=? AND user_id=?",(sid,user_id)).fetchone()
        if existing:
            c.execute("""UPDATE diagnostic_sessions SET equipment_id=?,symptom=?,status=?,risk_level=?,request_json=?,response_json=?,updated=?
                         WHERE id=? AND user_id=?""",
                      (equipment_id,symptom,status,risk,json.dumps(request_data),json.dumps(response_data),now,sid,user_id))
        else:
            c.execute("""INSERT INTO diagnostic_sessions(id,user_id,equipment_id,symptom,status,risk_level,request_json,response_json,outcome,created,updated)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                      (sid,user_id,equipment_id,symptom,status,risk,json.dumps(request_data),json.dumps(response_data),"",now,now))
    return sid

def mark_diagnostic_outcome(user_id,session_id,outcome):
    if not session_id:return False
    with connect() as c:
        c.execute("UPDATE diagnostic_sessions SET outcome=?,updated=? WHERE id=? AND user_id=?",
                  (outcome,int(time.time()),session_id,user_id))
    return True

def diagnostic_metrics():
    with connect() as c:
        total=c.execute("SELECT COUNT(*) n FROM diagnostic_sessions").fetchone()["n"]
        unresolved=c.execute("SELECT COUNT(*) n FROM diagnostic_sessions WHERE outcome='' AND status!='complete'").fetchone()["n"]
        red=c.execute("SELECT COUNT(*) n FROM diagnostic_sessions WHERE risk_level='red'").fetchone()["n"]
        fixed=c.execute("SELECT COUNT(*) n FROM diagnostic_sessions WHERE outcome='fixed'").fetchone()["n"]
        failed=c.execute("SELECT COUNT(*) n FROM diagnostic_sessions WHERE outcome='needs_work'").fetchone()["n"]
    return {"diagnostic_sessions":total,"unresolved_sessions":unresolved,"red_sessions":red,
            "confirmed_fixed_sessions":fixed,"needs_work_sessions":failed}

def list_unresolved(limit=100):
    with connect() as c:
        rows=c.execute("""SELECT id,user_id,equipment_id,symptom,status,risk_level,outcome,created,updated
                          FROM diagnostic_sessions WHERE outcome='' AND status!='complete'
                          ORDER BY updated DESC LIMIT ?""",(limit,)).fetchall()
    return [dict(r) for r in rows]
