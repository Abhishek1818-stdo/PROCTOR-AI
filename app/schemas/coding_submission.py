from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CodingSubmissionCreate(BaseModel):
    question_id: int = Field(gt=0)
    language: str = Field(min_length=1, max_length=50)
    source_code: str = Field(min_length=1)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("source_code")
    @classmethod
    def validate_source_code(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Source code cannot be empty")
        return value


class CodingSubmissionResponse(CodingSubmissionCreate):
    id: int
    attempt_id: int
    submitted_at: datetime
    execution_status: str | None
    test_cases_passed: int
    total_test_cases: int
    score: float | None
    execution_time: float | None
    memory_used: float | None

    model_config = ConfigDict(from_attributes=True)