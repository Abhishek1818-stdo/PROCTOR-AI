
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.attempt import Attempt
from app.models.proctoring_event import ProctoringEvent


# Risk points assigned to each event type
EVENT_RISK_POINTS = {
    "TAB_SWITCH": 5,
    "EXIT_FULLSCREEN": 5,
    "MULTIPLE_FACES": 15,
    "NO_FACE_DETECTED": 10,
    "CAMERA_DISABLED": 10,
    "SUSPICIOUS_ACTIVITY": 20,
}


def calculate_risk_level(risk_score: int) -> str:
    """Convert the total risk score into a risk level."""

    if risk_score >= 30:
        return "HIGH"

    if risk_score >= 10:
        return "MEDIUM"

    return "LOW"


def record_proctoring_event(
    db: Session,
    attempt_id: int,
    event_type: str,
    severity: str,
    evidence_reference: str | None = None,
) -> ProctoringEvent:
    """Save a proctoring event and update the attempt's risk score."""

    attempt = db.get(Attempt, attempt_id)

    if attempt is None:
        raise ValueError("Attempt not found")

    if attempt.status != "STARTED":
        raise ValueError(
            "Cannot record events for an attempt that is not active"
        )

    normalized_event_type = event_type.strip().upper()
    normalized_severity = severity.strip().upper()

    if normalized_event_type not in EVENT_RISK_POINTS:
        raise ValueError("Unsupported proctoring event type")

    if normalized_severity not in {"LOW", "MEDIUM", "HIGH"}:
        raise ValueError("Severity must be LOW, MEDIUM, or HIGH")

    current_risk_score = attempt.risk_score or 0

    if current_risk_score < 0:
        raise ValueError("Risk score cannot be negative")

    risk_points = EVENT_RISK_POINTS[normalized_event_type]
    updated_risk_score = current_risk_score + risk_points

    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type=normalized_event_type,
        severity=normalized_severity,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        risk_points=risk_points,
        evidence_reference=evidence_reference,
        review_status="PENDING",
    )

    attempt.risk_score = updated_risk_score
    attempt.risk_level = calculate_risk_level(updated_risk_score)

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception:
        db.rollback()
        raise


def get_proctoring_events(
    db: Session,
    attempt_id: int,
) -> list[ProctoringEvent]:
    """Return all proctoring events for an attempt."""

    attempt = db.get(Attempt, attempt_id)

    if attempt is None:
        raise ValueError("Attempt not found")

    return (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.attempt_id == attempt_id)
        .order_by(ProctoringEvent.timestamp.desc())
        .all()
    )
