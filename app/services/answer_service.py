
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.question import Question
from app.services.attempt_service import check_attempt_expiry


def validate_active_attempt(
    db: Session,
    attempt: Attempt,
) -> None:
    """Reject answer changes for expired or inactive attempts."""

    # Automatically submit the attempt if its time has expired.
    check_attempt_expiry(db, attempt)

    # Refresh the attempt state after the expiry check.
    db.refresh(attempt)

    if attempt.status != "STARTED":
        raise ValueError(
            "This attempt is no longer active. Answers cannot be changed."
        )


def validate_question_belongs_to_attempt(
    db: Session,
    attempt: Attempt,
    question_id: int,
) -> Question:
    """Ensure the question belongs to the attempt's assessment."""

    question = db.get(Question, question_id)

    if question is None:
        raise ValueError("Question not found")

    if question.assessment_id != attempt.assessment_id:
        raise ValueError(
            "This question does not belong to the attempt's assessment"
        )

    return question


def save_answer(
    db: Session,
    attempt: Attempt,
    question_id: int,
    answer_text: str | None,
    selected_option: str | None,
    time_spent: int | None,
) -> Answer:
    validate_active_attempt(db, attempt)

    validate_question_belongs_to_attempt(
        db=db,
        attempt=attempt,
        question_id=question_id,
    )

    existing_answer = (
        db.query(Answer)
        .filter(
            Answer.attempt_id == attempt.id,
            Answer.question_id == question_id,
        )
        .first()
    )

    try:
        if existing_answer:
            existing_answer.answer_text = answer_text
            existing_answer.selected_option = selected_option
            existing_answer.time_spent = time_spent
            existing_answer.answered_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(existing_answer)
            return existing_answer

        answer = Answer(
            attempt_id=attempt.id,
            question_id=question_id,
            answer_text=answer_text,
            selected_option=selected_option,
            time_spent=time_spent,
            marked_for_review=False,
            answered_at=datetime.now(timezone.utc),
        )

        db.add(answer)
        db.commit()
        db.refresh(answer)
        return answer

    except Exception:
        db.rollback()
        raise


def get_attempt_answers(
    db: Session,
    attempt_id: int,
) -> list[Answer]:
    return (
        db.query(Answer)
        .filter(Answer.attempt_id == attempt_id)
        .all()
    )


def mark_answer_for_review(
    db: Session,
    attempt: Attempt,
    question_id: int,
) -> Answer:
    validate_active_attempt(db, attempt)

    validate_question_belongs_to_attempt(
        db=db,
        attempt=attempt,
        question_id=question_id,
    )

    answer = (
        db.query(Answer)
        .filter(
            Answer.attempt_id == attempt.id,
            Answer.question_id == question_id,
        )
        .first()
    )

    try:
        if answer is None:
            answer = Answer(
                attempt_id=attempt.id,
                question_id=question_id,
                marked_for_review=True,
                answered_at=datetime.now(timezone.utc),
            )
            db.add(answer)
        else:
            answer.marked_for_review = True
            answer.answered_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(answer)
        return answer

    except Exception:
        db.rollback()
        raise
