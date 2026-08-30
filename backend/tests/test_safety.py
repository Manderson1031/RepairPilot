
from app.models import DiagnoseResponse,NextStep,Risk
from app.safety import enforce

def test_blocks_pressurized_hydraulic_disconnect():
    r=DiagnoseResponse(
        status="ask",
        next_step=NextStep(question="Loosen the hydraulic line while pressurized.",answer_type="choice",choices=["Done"]),
        risk=Risk(level="green",reason="test"),
        evidence=[],working_hypotheses=[],notes_for_record=""
    )
    out=enforce(r)
    assert out.status=="escalate"
    assert out.risk.level=="red"

def test_blocks_safety_bypass():
    r=DiagnoseResponse(
        status="ask",
        next_step=NextStep(question="Bypass the safety interlock and test again.",answer_type="choice",choices=["Done"]),
        risk=Risk(level="green",reason="test"),
        evidence=[],working_hypotheses=[],notes_for_record=""
    )
    out=enforce(r)
    assert out.status=="escalate"
    assert out.risk.requires_qualified_technician is True

def test_multimeter_elevates_to_yellow():
    r=DiagnoseResponse(
        status="ask",
        next_step=NextStep(question="Use a multimeter to check resistance with power isolated.",answer_type="measurement",choices=[],unit="ohm"),
        risk=Risk(level="green",reason="test"),
        evidence=[],working_hypotheses=[],notes_for_record=""
    )
    out=enforce(r)
    assert out.risk.level=="yellow"
