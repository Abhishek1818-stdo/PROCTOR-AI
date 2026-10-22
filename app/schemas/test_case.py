from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TestCaseCreate(BaseModel):
    question_id: int = Field(gt=0)
    input_data: str
    expected_output: str
    marks: float = Field(default=1.0, ge=0)
    is_hidden: bool = True


class TestCaseResponse(BaseModel):
    id: int
    question_id: int
    input_data: str
    expected_output: str
    marks: float
    is_hidden: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)