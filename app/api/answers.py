
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.models.attempt import Attempt
from app.schemas.answer import AnswerCreate, AnswerResponse
from app.services.answer_service import (
    save_answer,
    get_attempt_answers,
    mark_answer_for_review,
)

router = APIRouter(
    prefix="/attempts/{attempt_id}/answers",
    tags=["Answers"],
)


def get_valid_attempt(db: Session, attempt_id: int) -> Attempt:
    attempt = db.get(Attempt, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This attempt is no longer active",
        )

    return attempt


@router.post(
    "/",
    response_model=AnswerResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_answer(
    attempt_id: int,
    answer_data: AnswerCreate,
    db: Session = Depends(get_db),
):
    attempt = get_valid_attempt(db, attempt_id)

    answer = save_answer(
        db=db,
        attempt=attempt,
        question_id=answer_data.question_id,
        answer_text=answer_data.answer_text,
        selected_option=answer_data.selected_option,
        time_spent=answer_data.time_spent,
    )

    return answer


@router.get("/", response_model=list[AnswerResponse])
def list_answers(
    attempt_id: int,
    db: Session = Depends(get_db),
):
    get_valid_attempt(db, attempt_id)
    return get_attempt_answers(db, attempt_id)


@router.post(
    "/{question_id}/mark-review",
    response_model=AnswerResponse,
)
def mark_for_review(
    attempt_id: int,
    question_id: int,
    db: Session = Depends(get_db),
):
    attempt = get_valid_attempt(db, attempt_id)

    return mark_answer_for_review(
        db=db,
        attempt=attempt,
        question_id=question_id,
    )
