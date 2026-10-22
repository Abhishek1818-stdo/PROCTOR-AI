
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.assessment import Assessment
from app.models.question import Question


def start_attempt(
    db: Session,
    assessment_id: int,
    candidate_id: int,
    duration_minutes: int | None = None,
) -> Attempt:
    """Create an attempt only for an existing, active assessment."""

    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise ValueError("Assessment not found")

    if not assessment.is_active:
        raise ValueError("Assessment is not active")

    # Use the assessment's configured duration.
    duration = assessment.duration_minutes

    if duration is None or duration <= 0:
        raise ValueError("Assessment duration must be greater than zero")

    started_at = datetime.now(timezone.utc)
    server_expiry_at = started_at + timedelta(minutes=duration)

    attempt = Attempt(
        assessment_id=assessment.id,
        candidate_id=candidate_id,
        started_at=started_at,
        server_expiry_at=server_expiry_at,
        status="STARTED",
        risk_score=0,
        risk_level="LOW",
    )

    try:
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt
    except Exception:
        db.rollback()
        raise


def get_attempt(
    db: Session,
    attempt_id: int,
) -> Attempt | None:
    """Retrieve an attempt by ID."""

    return db.get(Attempt, attempt_id)


def check_attempt_expiry(
    db: Session,
    attempt: Attempt,
) -> Attempt:
    """Automatically submit an attempt when its time expires."""

    if attempt.status != "STARTED":
        return attempt

    expiry_time = attempt.server_expiry_at

    if expiry_time is None:
        return attempt

    current_time = datetime.now(timezone.utc)

    # Handle timestamps stored without timezone information.
    if expiry_time.tzinfo is None:
        expiry_time = expiry_time.replace(tzinfo=timezone.utc)

    if current_time >= expiry_time:
        return submit_attempt(db, attempt, auto_submitted=True)

    return attempt


def submit_attempt(
    db: Session,
    attempt: Attempt,
    auto_submitted: bool = False,
) -> Attempt:
    """Score answers and submit an attempt."""

    if attempt.status != "STARTED":
        return attempt

    assessment = db.get(Assessment, attempt.assessment_id)

    if assessment is None:
        raise ValueError(
            f"Assessment {attempt.assessment_id} not found "
            f"for attempt {attempt.id}"
        )

    questions = (
        db.query(Question)
        .filter(Question.assessment_id == attempt.assessment_id)
        .all()
    )

    question_by_id = {
        question.id: question for question in questions
    }

    answers = (
        db.query(Answer)
        .filter(Answer.attempt_id == attempt.id)
        .all()
    )

    total_score = 0.0

    for answer in answers:
        question = question_by_id.get(answer.question_id)

        if question is None:
            answer.is_correct = False
            answer.marks_awarded = 0.0
            continue

        selected = (
            answer.selected_option.strip().upper()
            if answer.selected_option
            else None
        )

        correct = (
            question.correct_answer.strip().upper()
            if question.correct_answer
            else None
        )

        is_correct = (
            selected is not None
            and correct is not None
            and selected == correct
        )

        answer.is_correct = is_correct
        answer.marks_awarded = (
            float(question.marks) if is_correct else 0.0
        )

        total_score += answer.marks_awarded

    maximum_marks = float(assessment.total_marks or 0)

    if maximum_marks < 0:
        raise ValueError("Assessment maximum marks cannot be negative")

    if total_score > maximum_marks:
        raise ValueError(
            f"Calculated score ({total_score}) exceeds "
            f"assessment maximum marks ({maximum_marks}). "
            "Check the question marks and assessment total."
        )

    percentage = (
        round((total_score / maximum_marks) * 100, 2)
        if maximum_marks > 0
        else 0.0
    )

    current_time = datetime.now(timezone.utc)

    attempt.score = total_score
    attempt.percentage = percentage
    attempt.status = (
        "AUTO_SUBMITTED" if auto_submitted else "SUBMITTED"
    )
    attempt.submitted_at = current_time

    try:
        db.commit()
        db.refresh(attempt)
        return attempt
    except Exception:
        db.rollback()
        raise
