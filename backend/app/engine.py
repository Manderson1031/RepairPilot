
import json, os
from .models import *
from .safety import enforce

SYSTEM="""You are RepairPilot, a conservative equipment diagnostic assistant.

Primary behavior:
- Ask exactly one next question or test.
- Use evidence to narrow the problem systematically.
- Prefer visual inspections, de-energized checks, installed gauges, and manual-backed facts.
- Treat image analysis as uncertain unless text/components are clearly visible.
- Do not make exact model/rating/spec claims without visual/manual evidence.
- Never instruct an unqualified person to probe energized industrial controls.
- Never instruct opening/loosening a pressurized hydraulic circuit.
- Never bypass or defeat a safety/interlock/guard/E-stop.
- If the next useful step is high-risk, return status=escalate.
- Cite manual evidence as 'Manual name, page N' when provided.
"""


def select_model(req:DiagnoseRequest,manual:list[dict])->str:
    """Route diagnostic work across current GPT-5.6 tiers unless explicitly overridden."""
    explicit=os.getenv("REPAIRPILOT_MODEL")
    if explicit:
        return explicit
    routine=os.getenv("REPAIRPILOT_MODEL_ROUTINE","gpt-5.6-luna")
    normal=os.getenv("REPAIRPILOT_MODEL_NORMAL","gpt-5.6-terra")
    difficult=os.getenv("REPAIRPILOT_MODEL_DIFFICULT","gpt-5.6-sol")
    category=(req.equipment_profile.category or "").lower()
    high_consequence=any(x in category for x in ("electrical","control","hydraulic","industrial"))
    if len(req.history)>=4 or (manual and len(req.history)>=2) or high_consequence:
        return difficult
    if len(req.history)<=1 and not manual and not req.visual_evidence:
        return routine
    return normal

SCHEMA={
"type":"object","additionalProperties":False,
"required":["status","next_step","risk","evidence","working_hypotheses","notes_for_record"],
"properties":{
"status":{"type":"string","enum":["ask","complete","escalate"]},
"next_step":{"anyOf":[{"type":"null"},{"type":"object","additionalProperties":False,
"required":["question","answer_type","choices","unit"],
"properties":{"question":{"type":"string"},"answer_type":{"type":"string","enum":["choice","measurement","text"]},"choices":{"type":"array","items":{"type":"string"}},"unit":{"anyOf":[{"type":"string"},{"type":"null"}]}}}]},
"risk":{"type":"object","additionalProperties":False,"required":["level","reason","requires_qualified_technician"],
"properties":{"level":{"type":"string","enum":["green","yellow","red"]},"reason":{"type":"string"},"requires_qualified_technician":{"type":"boolean"}}},
"evidence":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["source","citation","detail"],
"properties":{"source":{"type":"string","enum":["manual","user_measurement","visual","general"]},"citation":{"anyOf":[{"type":"string"},{"type":"null"}]},"detail":{"anyOf":[{"type":"string"},{"type":"null"}]}}}},
"working_hypotheses":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["cause","confidence"],"properties":{"cause":{"type":"string"},"confidence":{"type":"number","minimum":0,"maximum":1}}}},
"notes_for_record":{"type":"string"}
}}

def demo(req:DiagnoseRequest,manual:list[dict])->DiagnoseResponse:
    n=len(req.history); cat=req.equipment_profile.category.lower(); symptom=req.symptom.lower()
    evidence=[]
    if req.visual_evidence:
        evidence.append(Evidence(source="visual",detail=req.visual_evidence[-1].description))
    if manual:
        evidence.append(Evidence(source="manual",citation=f"{manual[0]['manual']}, page {manual[0]['page']}",detail="Relevant manual page found in demo retrieval."))

    if "hydraulic" in cat or "pressure" in symptom:
        steps=[
          ("With the machine safely stopped, is the reservoir level correct and is the pump drive intact?","choice",["Yes","No / found a problem","Not sure"],None,"green"),
          ("Using only the machine's installed pressure gauge, what pressure is shown while the affected function is commanded?","measurement",[],"PSI","yellow"),
          ("Does the pump sound normal, or is it whining/cavitating?","choice",["Sounds normal","Whines / cavitates","Not sure"],None,"green")]
        hypo=[Hypothesis(cause="Pump flow/inlet issue",confidence=.45),Hypothesis(cause="Relief/unloading valve path",confidence=.30)]
    elif "elect" in cat or "contactor" in symptom:
        hypo=[Hypothesis(cause="Upstream control-circuit open",confidence=.45),Hypothesis(cause="Contactor coil/mechanism fault",confidence=.35)]
        if n and req.history[-1].answer.lower() in {"no","not qualified / stop"}:
            return enforce(DiagnoseResponse(status="escalate",next_step=None,risk=Risk(level="red",reason="The next useful electrical test would require a qualified person to obtain an energized measurement.",requires_qualified_technician=True),evidence=evidence,working_hypotheses=hypo,notes_for_record="Escalated before energized electrical testing."))
        steps=[
          ("Do you already have a safely obtained, verified voltage reading directly across the contactor coil while ON is commanded?","choice",["Yes","No","Not qualified / stop"],None,"green"),
          ("Enter that already-obtained coil-voltage reading.","measurement",[],"V","green"),
          ("With power isolated and verified de-energized, did a coil-resistance or mechanical inspection reveal an open coil or stuck armature?","choice",["Open/failed coil","Mechanical binding","Neither","Not tested"],None,"yellow")]
    else:
        steps=[
          ("Does partially applying the choke change the surging?","choice",["Surging improves","No change","Gets worse"],None,"green"),
          ("With the engine off, inspect the governor spring and throttle/carburetor linkage. Anything disconnected, binding, stretched, or loose?","choice",["Looks normal","Found a problem","Not sure"],None,"green"),
          ("When running safely outdoors, does the governor/throttle linkage visibly move back and forth with the RPM?","choice",["Yes","No","Can't tell"],None,"yellow")]
        hypo=[Hypothesis(cause="Lean fuel mixture / restricted idle-off-idle circuit",confidence=.5),Hypothesis(cause="Governor/linkage hunting",confidence=.3)]
    if n>=len(steps):
        return enforce(DiagnoseResponse(status="complete",next_step=None,risk=Risk(level="green",reason="Available demo path complete."),evidence=evidence,working_hypotheses=hypo,notes_for_record="Demo path complete."))
    q,t,ch,u,r=steps[n]
    return enforce(DiagnoseResponse(status="ask",next_step=NextStep(question=q,answer_type=t,choices=ch,unit=u),risk=Risk(level=r,reason="Risk classified before presentation.",requires_qualified_technician=(r=="red")),evidence=evidence,working_hypotheses=hypo,notes_for_record="Demo mode."))

def diagnose(req:DiagnoseRequest,manual:list[dict])->DiagnoseResponse:
    if not os.getenv("OPENAI_API_KEY"): return demo(req,manual)
    from openai import OpenAI
    client=OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    context={"equipment_profile":req.equipment_profile.model_dump(),"symptom":req.symptom,
             "history":[h.model_dump() for h in req.history],
             "visual_evidence":[v.model_dump() for v in req.visual_evidence],
             "manual_excerpts":manual}
    resp=client.responses.create(
      model=select_model(req,manual),
      instructions=SYSTEM,input=json.dumps(context),
      text={"format":{"type":"json_schema","name":"repairpilot_diagnostic","strict":True,"schema":SCHEMA}},
      max_output_tokens=1300,store=False)
    return enforce(DiagnoseResponse.model_validate(json.loads(resp.output_text)))
