from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProctoringEventCreate(BaseModel):
    event_type: str
    severity: str
    evidence_reference: str | None = None


class ProctoringEventResponse(ProctoringEventCreate):
    id: int
    attempt_id: int
    timestamp: datetime
    risk_points: int
    review_status: str
    reviewed_by: int | None
    review_comment: str | None

    model_config = ConfigDict(from_attributes=True)