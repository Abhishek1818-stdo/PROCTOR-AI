from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AnswerCreate(BaseModel):
    question_id: int
    answer_text: str | None = None
    selected_option: str | None = None
    time_spent: int | None = None


class AnswerResponse(BaseModel):
    id: int
    attempt_id: int
    question_id: int
    answer_text: str | None
    selected_option: str | None
    is_correct: bool | None
    marks_awarded: float | None
    time_spent: int | None
    marked_for_review: bool
    answered_at: datetime

    model_config = ConfigDict(from_attributes=True)