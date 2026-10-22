
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttemptCreate(BaseModel):
    # The client chooses the assessment, not the candidate identity.
    assessment_id: int


class AttemptResponse(BaseModel):
    assessment_id: int
    candidate_id: int
    id: int
    started_at: datetime
    submitted_at: datetime | None
    server_expiry_at: datetime
    status: str
    score: float | None
    percentage: float | None
    risk_score: int
    risk_level: str

    model_config = ConfigDict(from_attributes=True)
