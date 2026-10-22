
from pydantic import BaseModel, ConfigDict, Field


class QuestionCreate(BaseModel):
    question_text: str = Field(min_length=5)
    option_a: str = Field(min_length=1, max_length=500)
    option_b: str = Field(min_length=1, max_length=500)
    option_c: str = Field(min_length=1, max_length=500)
    option_d: str = Field(min_length=1, max_length=500)
    correct_answer: str = Field(pattern=r"^[ABCD]$")
    marks: int = Field(default=1, gt=0)


class QuestionResponse(BaseModel):
    id: int
    assessment_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    marks: int

    model_config = ConfigDict(from_attributes=True)


class QuestionAdminResponse(QuestionResponse):
    correct_answer: str
