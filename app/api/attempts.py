
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database.dependencies import get_db
from app.models.user import User
from app.models.attempt import Attempt
from app.schemas.attempt import AttemptCreate, AttemptResponse
from app.schemas.answer import AnswerCreate, AnswerResponse
from app.services.attempt_service import (
    start_attempt,
    get_attempt,
    check_attempt_expiry,
    submit_attempt,
)
from app.services.answer_service import (
    save_answer,
    get_attempt_answers,
    mark_answer_for_review,
)

router = APIRouter(prefix="/attempts", tags=["Attempts"])


class ProctoringStatusUpdate(BaseModel):
    camera_ready: bool
    microphone_ready: bool


def get_owned_attempt(
    attempt_id: int,
    db: Session,
    current_user: User,
):
    """Return an attempt only if it belongs to the logged-in candidate."""
    attempt = get_attempt(db, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    if attempt.candidate_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to access this attempt",
        )

    return attempt


@router.post("/", response_model=AttemptResponse)
def create_attempt(
    attempt_data: AttemptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resume an active attempt or create a new one."""

    existing_attempt = db.scalar(
        select(Attempt)
        .where(
            Attempt.assessment_id == attempt_data.assessment_id,
            Attempt.candidate_id == current_user.id,
            Attempt.status == "STARTED",
        )
        .order_by(Attempt.id.desc())
    )

    if existing_attempt is not None:
        check_attempt_expiry(db, existing_attempt)

        if existing_attempt.status == "STARTED":
            return existing_attempt

    try:
        return start_attempt(
            db=db,
            assessment_id=attempt_data.assessment_id,
            candidate_id=current_user.id,
            duration_minutes=90,
        )
    except ValueError as exc:
        message = str(exc)

        if message == "Assessment not found":
            raise HTTPException(
                status_code=404,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=400,
            detail=message,
        ) from exc


@router.get("/{attempt_id}", response_model=AttemptResponse)
def read_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an attempt owned by the logged-in candidate."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    return attempt


@router.post(
    "/{attempt_id}/answers",
    response_model=AnswerResponse,
)
def create_answer(
    attempt_id: int,
    answer_data: AnswerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save or update an answer for an active attempt."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=400,
            detail="This attempt is no longer active",
        )

    try:
        return save_answer(
            db=db,
            attempt=attempt,
            question_id=answer_data.question_id,
            answer_text=answer_data.answer_text,
            selected_option=answer_data.selected_option,
            time_spent=answer_data.time_spent,
        )
    except ValueError as exc:
        message = str(exc)

        if message == "Question not found":
            raise HTTPException(
                status_code=404,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=400,
            detail=message,
        ) from exc


@router.get(
    "/{attempt_id}/answers",
    response_model=list[AnswerResponse],
)
def read_answers(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get saved answers for the candidate's attempt."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    return get_attempt_answers(
        db=db,
        attempt_id=attempt.id,
    )


@router.post(
    "/{attempt_id}/answers/{question_id}/review",
    response_model=AnswerResponse,
)
def review_answer(
    attempt_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a question for review during an active attempt."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=400,
            detail="This attempt is no longer active",
        )

    try:
        return mark_answer_for_review(
            db=db,
            attempt=attempt,
            question_id=question_id,
        )
    except ValueError as exc:
        message = str(exc)

        if message == "Question not found":
            raise HTTPException(
                status_code=404,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=400,
            detail=message,
        ) from exc


@router.post(
    "/{attempt_id}/submit",
    response_model=AttemptResponse,
)
def submit_candidate_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit the attempt and calculate its result."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=400,
            detail=(
                "This attempt has already been submitted "
                "or is no longer active"
            ),
        )

    if attempt.proctoring_status != "READY":
        raise HTTPException(
            status_code=403,
            detail=(
                "Submission blocked: camera and microphone "
                "must be available."
            ),
        )

    return submit_attempt(
        db=db,
        attempt=attempt,
    )


@router.patch("/{attempt_id}/proctoring-status")
def update_proctoring_status(
    attempt_id: int,
    status_data: ProctoringStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update camera and microphone availability."""

    attempt = get_owned_attempt(
        attempt_id,
        db,
        current_user,
    )

    check_attempt_expiry(db, attempt)

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=400,
            detail="This attempt is no longer active",
        )

    if status_data.camera_ready and status_data.microphone_ready:
        attempt.proctoring_status = "READY"
    else:
        attempt.proctoring_status = "BLOCKED"

    try:
        db.commit()
        db.refresh(attempt)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to update proctoring status",
        ) from exc

    return {
        "attempt_id": attempt.id,
        "proctoring_status": attempt.proctoring_status,
        "camera_ready": status_data.camera_ready,
        "microphone_ready": status_data.microphone_ready,
    }
