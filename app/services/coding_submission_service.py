from sqlalchemy.orm import Session

from app.models.attempt import Attempt
from app.models.coding_submission import CodingSubmission


def create_coding_submission(
    db: Session,
    attempt: Attempt,
    question_id: int,
    language: str,
    source_code: str,
) -> CodingSubmission:

    submission = CodingSubmission(
        attempt_id=attempt.id,
        question_id=question_id,
        language=language,
        source_code=source_code,
        execution_status="PENDING",
        test_cases_passed=0,
        total_test_cases=0,
    )

    try:
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission
    except Exception:
        db.rollback()
        raise


def get_coding_submissions(
    db: Session,
    attempt_id: int,
) -> list[CodingSubmission]:

    return (
        db.query(CodingSubmission)
        .filter(CodingSubmission.attempt_id == attempt_id)
        .order_by(CodingSubmission.submitted_at.desc())
        .all()
    )


def get_coding_submission(
    db: Session,
    attempt_id: int,
    submission_id: int,
) -> CodingSubmission | None:

    return (
        db.query(CodingSubmission)
        .filter(
            CodingSubmission.id == submission_id,
            CodingSubmission.attempt_id == attempt_id,
        )
        .first()
    )