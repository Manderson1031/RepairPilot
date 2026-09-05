import io
from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from .authdb import audit, get_equipment, list_repairs
from .ar_assistant import analyze_ar_component
from .hardware_depth import fuse_scan_with_depth
from .hardware_matching import enrich_scan_with_dimensional_candidates
from .hardware_replacement import replacement_plan
from .maintenance import lookup_manufacturer_maintenance
from .main import app, bearer_scheme, limiter, user_from_credentials
from .thread_vision import fuse_thread_measurement, measure_thread_pitch_from_crests


@app.post("/hardware/fuse-depth")
@limiter.limit("30/minute")
def hardware_fuse_depth(request: Request,payload: dict,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict): raise HTTPException(400, "A hardware scan result is required.")
    measurements = payload.get("measurements")
    if measurements is not None and not isinstance(measurements, dict): raise HTTPException(400, "Depth measurements must be an object.")
    result = fuse_scan_with_depth(scan,measurements,depth_confidence=payload.get("confidence", 0),source=str(payload.get("source") or "arkit_lidar"))
    result = enrich_scan_with_dimensional_candidates(result)
    depth = result.get("depth_measurement") or {}; size = result.get("size_resolution") or {}
    audit(user["sub"],"hardware.depth_fused","hardware","",{"kind":result.get("kind","OTHER"),"applied":bool(depth.get("applied")),"source":depth.get("source","arkit_lidar"),"confidence":depth.get("confidence",0),"fields":depth.get("fields",[]),"size_candidates":size.get("candidate_count",0),"thread_confirmed":bool(size.get("thread_confirmed"))})
    return result


@app.post("/hardware/fuse-thread")
@limiter.limit("30/minute")
def hardware_fuse_thread(request: Request,payload: dict,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict): raise HTTPException(400, "A hardware scan result is required.")
    crests = payload.get("crest_positions_px")
    if not isinstance(crests, list): raise HTTPException(400, "Thread crest positions must be an array.")
    measured = measure_thread_pitch_from_crests(crests,mm_per_pixel=payload.get("mm_per_pixel"))
    result = enrich_scan_with_dimensional_candidates(fuse_thread_measurement(scan, measured))
    thread = result.get("thread_measurement") or {}; size = result.get("size_resolution") or {}
    audit(user["sub"],"hardware.thread_fused","hardware","",{"kind":result.get("kind","OTHER"),"applied":bool(thread.get("applied")),"source":thread.get("source","closeup_rgb_calibrated"),"confidence":thread.get("confidence",0),"interval_count":thread.get("interval_count"),"size_candidates":size.get("candidate_count",0),"thread_confirmed":bool(size.get("thread_confirmed"))})
    return result


@app.post("/hardware/replacement-plan")
@limiter.limit("30/minute")
def hardware_replacement_plan(request: Request,payload: dict,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict): raise HTTPException(400, "A hardware scan result is required.")
    plan = replacement_plan(scan)
    audit(user["sub"],"hardware.replacement_planned","hardware","",{"kind":plan.get("kind","OTHER"),"readiness":plan.get("readiness","identify_only"),"search_ready":bool(plan.get("search_ready")),"exact_replacement_ready":bool(plan.get("exact_replacement_ready")),"confidence":plan.get("confidence",0),"missing_evidence":plan.get("missing_evidence",[])})
    return plan


@app.post("/ar/ask")
@limiter.limit("20/minute")
def ar_ask(request: Request,payload: dict,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user = user_from_credentials(credentials)
    image_base64 = str(payload.get("image_base64") or "")
    if len(image_base64) > 20_000_000: raise HTTPException(413, "AR camera frame is too large.")
    point = payload.get("point") or {}
    if not isinstance(point, dict): raise HTTPException(400, "A selected AR point is required.")
    question = str(payload.get("question") or "").strip()
    if not question: raise HTTPException(400, "Ask a question about the selected component.")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    try:
        result = analyze_ar_component(image_base64=image_base64,mime_type=str(payload.get("mime_type") or "image/jpeg"),point=point,question=question[:1200],context=context)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    audit(user["sub"],"ar.component_asked","equipment",str(context.get("equipment_id") or ""),{"question":question[:180],"identified_part":result.get("identified_part",""),"confidence":result.get("confidence",0),"guided_steps":len(result.get("guided_steps") or [])})
    return result


@app.post("/maintenance/lookup")
@limiter.limit("10/minute")
def maintenance_lookup(request: Request,payload: dict,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user=user_from_credentials(credentials)
    equipment_id=str(payload.get("equipment_id") or "").strip()
    if not equipment_id: raise HTTPException(400,"Choose a saved piece of equipment first.")
    equipment=get_equipment(user["sub"],equipment_id)
    if not equipment: raise HTTPException(404,"Equipment not found.")
    result=lookup_manufacturer_maintenance(equipment)
    audit(user["sub"],"maintenance.manufacturer_lookup","equipment",equipment_id,{"manufacturer":equipment.get("manufacturer",""),"model":equipment.get("model",""),"schedule_items":len(result.get("schedule") or []),"materials":len(result.get("materials") or [])})
    return result


def _pdf_line(c,text,x,y,width=100):
    words=str(text or '').replace('\n',' ').split(); line=''; lines=[]
    for word in words:
        candidate=(line+' '+word).strip()
        if len(candidate)>width:
            if line: lines.append(line)
            line=word
        else: line=candidate
    if line or not lines: lines.append(line)
    for line in lines:
        c.drawString(x,y,line); y-=14
    return y


@app.get("/equipment/{equipment_id}/service-history.pdf")
def equipment_service_history_pdf(equipment_id:str,credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    user=user_from_credentials(credentials)
    equipment=get_equipment(user["sub"],equipment_id)
    if not equipment: raise HTTPException(404,"Equipment not found.")
    records=[r for r in list_repairs(user["sub"],equipment_id) if str(r.get("symptom") or "").lower().startswith("maintenance:")]
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=letter); width,height=letter; y=height-48
    c.setFont("Helvetica-Bold",18); c.drawString(46,y,"RepairPilot Service & Maintenance History"); y-=24
    c.setFont("Helvetica",10)
    identity=' | '.join(str(x) for x in [equipment.get('name'),equipment.get('manufacturer'),equipment.get('model')] if x)
    y=_pdf_line(c,identity,46,y); y=_pdf_line(c,f"Serial: {equipment.get('serial') or 'Not recorded'}",46,y); y-=8
    c.setFont("Helvetica-Bold",10); c.drawString(46,y,f"Recorded maintenance events: {len(records)}"); y-=20
    for i,r in enumerate(records,1):
        if y<125: c.showPage(); y=height-48
        c.setFont("Helvetica-Bold",11); y=_pdf_line(c,f"{i}. {str(r.get('symptom') or 'Maintenance').replace('Maintenance:','').strip()}",46,y)
        c.setFont("Helvetica",9.5)
        for label,value in [("Completed",r.get("date") or r.get("created_at") or "Recorded"),("Service performed",r.get("fix") or ""),("Fluids / filters / materials",r.get("part") or ""),("Hours / mileage / notes",r.get("notes") or "")]:
            c.setFont("Helvetica-Bold",9.5); c.drawString(56,y,label+":"); c.setFont("Helvetica",9.5); y=_pdf_line(c,value,175,y,72); y-=2
        y-=8
    y-=6; c.setFont("Helvetica-Oblique",8.5); y=_pdf_line(c,"This report reflects service records entered in RepairPilot. Manufacturer-schedule compliance should only be claimed when the recorded history supports it.",46,y,112)
    c.save(); buf.seek(0)
    safe=''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in str(equipment.get('name') or equipment_id))[:50]
    audit(user["sub"],"maintenance.history_exported","equipment",equipment_id,{"records":len(records)})
    return StreamingResponse(buf,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="RepairPilot_Service_History_{safe}.pdf"'})
