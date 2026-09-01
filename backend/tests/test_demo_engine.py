
from app.models import DiagnoseRequest,EquipmentProfile
from app.engine import demo

def test_demo_small_engine_one_step():
    req=DiagnoseRequest(
        equipment_profile=EquipmentProfile(name="Mower",category="Small engine"),
        symptom="Engine surges",
        history=[],visual_evidence=[]
    )
    out=demo(req,[])
    assert out.status=="ask"
    assert out.next_step is not None
    assert "choke" in out.next_step.question.lower()

def test_demo_hydraulic_does_not_open_pressure_line():
    req=DiagnoseRequest(
        equipment_profile=EquipmentProfile(name="Press",category="Hydraulic equipment"),
        symptom="No pressure",
        history=[],visual_evidence=[]
    )
    out=demo(req,[])
    text=(out.next_step.question if out.next_step else "").lower()
    assert "loosen" not in text
    assert "disconnect" not in text


def test_two_unavailable_checks_pause_diagnosis():
    from app.models import HistoryItem
    from app.engine import pause_for_unavailable_access
    req=DiagnoseRequest(
        equipment_profile=EquipmentProfile(name="Mower",category="Small engine"),
        symptom="Engine surges",
        history=[
            HistoryItem(question="Inspect spark plugs",answer="Unable to inspect right now"),
            HistoryItem(question="Inspect fuel filter",answer="Unable to inspect right now"),
        ],visual_evidence=[]
    )
    out=pause_for_unavailable_access(req)
    assert out is not None
    assert out.status=="paused"
    assert out.next_step is not None
    assert out.next_step.question=="Inspect fuel filter"

def test_one_unavailable_check_does_not_pause():
    from app.models import HistoryItem
    from app.engine import pause_for_unavailable_access
    req=DiagnoseRequest(
        equipment_profile=EquipmentProfile(name="Mower",category="Small engine"),
        symptom="Engine surges",
        history=[HistoryItem(question="Inspect spark plugs",answer="Unable to inspect right now")],visual_evidence=[]
    )
    assert pause_for_unavailable_access(req) is None
