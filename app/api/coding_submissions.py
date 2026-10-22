from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.schemas.coding_submission import (
    CodingSubmissionCreate,
    CodingSubmissionResponse,
)
from app.services.attempt_service import (
    check_attempt_expiry,
    get_attempt,
)
from app.services.coding_submission_service import (
    create_coding_submission,
    get_coding_submission,
    get_coding_submissions,
)

router = APIRouter(
    prefix="/attempts",
    tags=["Coding Submissions"],
)


@router.post(
    "/{attempt_id}/code-submissions",
    response_model=CodingSubmissionResponse,
    status_code=201,
)
def submit_code(
    attempt_id: int,
    submission_data: CodingSubmissionCreate,
    db: Session = Depends(get_db),
):
    attempt = get_attempt(db, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    attempt = check_attempt_expiry(db, attempt)

    if attempt.status != "STARTED":
        raise HTTPException(
            status_code=400,
            detail="Attempt is no longer active",
        )

    return create_coding_submission(
        db=db,
        attempt=attempt,
        question_id=submission_data.question_id,
        language=submission_data.language,
        source_code=submission_data.source_code,
    )


@router.get(
    "/{attempt_id}/code-submissions",
    response_model=list[CodingSubmissionResponse],
)
def list_code_submissions(
    attempt_id: int,
    db: Session = Depends(get_db),
):
    attempt = get_attempt(db, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    return get_coding_submissions(
        db=db,
        attempt_id=attempt_id,
    )


@router.get(
    "/{attempt_id}/code-submissions/{submission_id}",
    response_model=CodingSubmissionResponse,
)
def retrieve_code_submission(
    attempt_id: int,
    submission_id: int,
    db: Session = Depends(get_db),
):
    attempt = get_attempt(db, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    submission = get_coding_submission(
        db=db,
        attempt_id=attempt_id,
        submission_id=submission_id,
    )

    if submission is None:
        raise HTTPException(
            status_code=404,
            detail="Coding submission not found",
        )

    return submission