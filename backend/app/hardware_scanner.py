import base64
import json
import mimetypes
import os
from pathlib import Path
from typing import Any

MEASUREMENT_KEYS=("diameter_mm","length_mm","thread_pitch_mm","threads_per_inch","width_mm","height_mm")
VALID_KINDS={"FASTENER","FITTING","BEARING","OTHER"}


def _empty_measurements()->dict[str,None]:
    return {key:None for key in MEASUREMENT_KEYS}


def _empty_result(kind:str,reason:str)->dict[str,Any]:
    return {"kind":kind if kind in VALID_KINDS else "OTHER","identified_part":"","standard":"","measurements":_empty_measurements(),"markings":[],"candidate_matches":[],"confidence":0.0,"needs_reference_scale":True,"warnings":[reason]}


def _normalize_result(result:dict[str,Any],requested_kind:str)->dict[str,Any]:
    model_kind=str(result.get("kind") or "OTHER").strip().upper()
    if model_kind not in VALID_KINDS:model_kind="OTHER"
    automatic=requested_kind=="AUTO"
    final_kind=model_kind if automatic else requested_kind
    if final_kind not in VALID_KINDS:final_kind=model_kind
    out=_empty_result(final_kind,"");out["warnings"]=[]
    out["identified_part"]=str(result.get("identified_part") or "").strip()[:300]
    out["standard"]=str(result.get("standard") or "").strip()[:300]
    out["markings"]=[str(x).strip()[:200] for x in (result.get("markings") or []) if str(x).strip()][:20]
    candidates=[]
    for item in result.get("candidate_matches") or []:
        if not isinstance(item,dict):continue
        name=str(item.get("name") or "").strip()[:300];reason=str(item.get("reason") or "").strip()[:600]
        if name:candidates.append({"name":name,"reason":reason})
    out["candidate_matches"]=candidates[:10]
    try:confidence=float(result.get("confidence",0.0))
    except (TypeError,ValueError):confidence=0.0
    out["confidence"]=max(0.0,min(1.0,confidence))
    out["needs_reference_scale"]=bool(result.get("needs_reference_scale",True))
    out["warnings"]=[str(x).strip()[:600] for x in (result.get("warnings") or []) if str(x).strip()][:20]
    incoming=result.get("measurements") or {}
    if isinstance(incoming,dict) and not out["needs_reference_scale"]:
        for key in MEASUREMENT_KEYS:
            value=incoming.get(key)
            if value is None:continue
            try:number=float(value)
            except (TypeError,ValueError):continue
            if 0<number<100000:out["measurements"][key]=number
    elif isinstance(incoming,dict) and any(incoming.get(key) is not None for key in MEASUREMENT_KEYS):
        out["warnings"].append("Image-only dimensions were withheld because no trustworthy reference scale was confirmed.")
    out["kind"]=final_kind
    return out


def analyze_hardware_image(path:Path,filename:str,kind:str="AUTO")->dict[str,Any]:
    requested_kind=(kind or "AUTO").strip().upper()
    if requested_kind not in VALID_KINDS|{"AUTO"}:requested_kind="AUTO"
    key=os.getenv("OPENAI_API_KEY")
    if not key:return _empty_result("OTHER" if requested_kind=="AUTO" else requested_kind,"AI hardware analysis is not configured on the server.")
    from openai import OpenAI
    client=OpenAI(api_key=key)
    mime=mimetypes.guess_type(filename)[0] or "image/jpeg"
    data=base64.b64encode(path.read_bytes()).decode()
    schema={"type":"object","additionalProperties":False,"required":["kind","identified_part","standard","measurements","markings","candidate_matches","confidence","needs_reference_scale","warnings"],"properties":{"kind":{"type":"string","enum":["FASTENER","FITTING","BEARING","OTHER"]},"identified_part":{"type":"string"},"standard":{"type":"string"},"measurements":{"type":"object","additionalProperties":False,"required":list(MEASUREMENT_KEYS),"properties":{key:{"type":["number","null"]} for key in MEASUREMENT_KEYS}},"markings":{"type":"array","items":{"type":"string"}},"candidate_matches":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["name","reason"],"properties":{"name":{"type":"string"},"reason":{"type":"string"}}}},"confidence":{"type":"number","minimum":0,"maximum":1},"needs_reference_scale":{"type":"boolean"},"warnings":{"type":"array","items":{"type":"string"}}}}
    instructions="""You are RepairPilot's automatic hardware and machine-part scanner.
First determine what kind of part is visible. Use FASTENER for bolts, screws, nuts, washers and studs; FITTING for fluid/air/hydraulic fittings; BEARING for bearings; and OTHER for springs, clips, pins, bushings, gears, brackets, electrical parts, tools, or anything else.
Identify the specific visible part family as precisely as the evidence supports. Never invent dimensions, thread pitch, grade, pressure rating, bearing number, fitting standard, spring rate, or replacement part number.
If there is no trustworthy scale/reference object in the same plane as the hardware, return null for image-only physical dimensions and set needs_reference_scale=true. LiDAR dimensions may be fused separately by the app.
Read visible stamps, codes and manufacturer markings exactly when possible. Candidate matches are hypotheses only and must include a reason. Use confidence conservatively."""
    category_text="Determine the category automatically." if requested_kind=="AUTO" else f"The user supplied category {requested_kind}; use it unless the image clearly contradicts it."
    response=client.responses.create(model=os.getenv("REPAIRPILOT_VISION_MODEL","gpt-5.6-terra"),instructions=instructions,input=[{"role":"user","content":[{"type":"input_text","text":f"Scan this hardware or machine part. {category_text}"},{"type":"input_image","image_url":f"data:{mime};base64,{data}"}]}],text={"format":{"type":"json_schema","name":"hardware_scan","strict":True,"schema":schema}},max_output_tokens=1200,store=False)
    return _normalize_result(json.loads(response.output_text),requested_kind)
