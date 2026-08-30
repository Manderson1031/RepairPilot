
import json
from pathlib import Path
from app.models import DiagnoseResponse,NextStep,Risk
from app.safety import enforce

def test_regression_cases():
    cases=json.loads((Path(__file__).parent/"safety_cases.json").read_text())
    for c in cases:
        r=DiagnoseResponse(
            status="ask",
            next_step=NextStep(question=c["input"],answer_type="text",choices=[]),
            risk=Risk(level="green",reason="test"),
            evidence=[],working_hypotheses=[],notes_for_record=""
        )
        out=enforce(r)
        if c["expected"]=="block":
            assert out.status=="escalate",c["input"]
        elif c["expected"]=="yellow":
            assert out.risk.level=="yellow",c["input"]
        else:
            assert out.status!="escalate",c["input"]
