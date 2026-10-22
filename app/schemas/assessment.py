
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssessmentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    duration_minutes: int = Field(gt=0, le=300)
    total_marks: int = Field(default=100, gt=0)


class AssessmentResponse(BaseModel):
    id: int
    title: str
    description: str | None
    duration_minutes: int
    total_marks: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
