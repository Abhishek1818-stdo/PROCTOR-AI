
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.api.auth import get_current_admin
from app.schemas.question import (
    QuestionCreate,
    QuestionResponse,
    QuestionAdminResponse,
)
from app.services.question_service import (
    create_question,
    get_questions_for_assessment,
)

router = APIRouter(
    prefix="/assessments/{assessment_id}/questions",
    tags=["Questions"],
)


# Admin only: Add a question to an assessment
@router.post(
    "/",
    response_model=QuestionAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_question(
    assessment_id: int,
    question_data: QuestionCreate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    question = create_question(
        db,
        assessment_id,
        question_data,
    )

    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    return question


# Admins and candidates: List questions without correct answers
@router.get(
    "/",
    response_model=list[QuestionResponse],
)
def list_questions(
    assessment_id: int,
    db: Session = Depends(get_db),
):
    questions = get_questions_for_assessment(
        db,
        assessment_id,
    )

    return questions
