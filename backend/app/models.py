
from typing import Literal, Optional
from pydantic import BaseModel, Field

RiskLevel = Literal["green","yellow","red"]
AnswerType = Literal["choice","measurement","text"]
StatusType = Literal["ask","complete","escalate"]

class EquipmentProfile(BaseModel):
    id: Optional[str] = None
    name: str
    manufacturer: str = ""
    model: str = ""
    serial: str = ""
    category: str = ""
    notes: str = ""


def equipment_profile_from_record(record: dict) -> EquipmentProfile:
    """Build an EquipmentProfile from a database row, normalizing nullable text columns."""
    return EquipmentProfile(
        id=record.get("id"),
        name=record.get("name") or "",
        manufacturer=record.get("manufacturer") or "",
        model=record.get("model") or "",
        serial=record.get("serial") or "",
        category=record.get("category") or "",
        notes=record.get("notes") or "",
    )

class HistoryItem(BaseModel):
    question: str
    answer: str
    risk: RiskLevel = "green"

class VisualEvidence(BaseModel):
    upload_id: str
    filename: str
    description: str = ""
    extracted_text: list[str] = Field(default_factory=list)
    likely_objects: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0, ge=0, le=1)

class DiagnoseRequest(BaseModel):
    session_id: Optional[str] = None
    equipment_profile: EquipmentProfile
    symptom: str
    history: list[HistoryItem] = Field(default_factory=list)
    visual_evidence: list[VisualEvidence] = Field(default_factory=list)

class NextStep(BaseModel):
    question: str
    answer_type: AnswerType
    choices: list[str] = Field(default_factory=list)
    unit: Optional[str] = None

class Risk(BaseModel):
    level: RiskLevel
    reason: str
    requires_qualified_technician: bool = False

class Evidence(BaseModel):
    source: Literal["manual","user_measurement","visual","general"]
    citation: Optional[str] = None
    detail: Optional[str] = None

class Hypothesis(BaseModel):
    cause: str
    confidence: float = Field(ge=0, le=1)

class DiagnoseResponse(BaseModel):
    session_id: Optional[str] = None
    status: StatusType
    next_step: Optional[NextStep] = None
    risk: Risk
    evidence: list[Evidence] = Field(default_factory=list)
    working_hypotheses: list[Hypothesis] = Field(default_factory=list)
    notes_for_record: str = ""

class PhotoAnalysisResponse(BaseModel):
    upload_id: str
    filename: str
    description: str
    extracted_text: list[str] = Field(default_factory=list)
    likely_objects: list[str] = Field(default_factory=list)
    suggested_profile_updates: dict[str, str] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
