
import re
from .models import DiagnoseResponse, Risk

RED = [
    r"\bprobe\b.*\blive\b", r"\benergized\b.*\bterminal\b",
    r"\bloosen\b.*\bhydraulic\b.*\b(line|fitting|hose)\b",
    r"\bdisconnect\b.*\bpressur", r"\bbypass\b.*\b(safety|interlock|e-?stop|guard)",
    r"\bjumper\b.*\b(safety|interlock|e-?stop|guard)",
    r"\bdefeat\b.*\b(safety|interlock|guard)\b"
]
YELLOW = [r"\bmultimeter\b", r"\bvoltage\b", r"\bresistance\b", r"\bcontinuity\b",
          r"\bpressure gauge\b", r"\bremove\b.*\bcover\b"]

def enforce(resp: DiagnoseResponse) -> DiagnoseResponse:
    q = (resp.next_step.question if resp.next_step else "").lower()
    if any(re.search(p, q) for p in RED):
        return DiagnoseResponse(
            status="escalate", next_step=None,
            risk=Risk(level="red",reason="RepairPilot blocked a high-energy, pressurized, or safety-bypass procedure.",requires_qualified_technician=True),
            evidence=resp.evidence, working_hypotheses=resp.working_hypotheses,
            notes_for_record="Post-generation safety gate replaced the proposed step with technician escalation."
        )
    if resp.risk.level=="green" and any(re.search(p,q) for p in YELLOW):
        resp.risk.level="yellow"
        resp.risk.reason="This measurement/access step requires appropriate isolation, PPE, and competence."
    return resp
