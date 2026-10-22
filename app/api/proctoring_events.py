
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_admin, get_current_user
from app.database.dependencies import get_db
from app.models.attempt import Attempt
from app.models.proctoring_event import ProctoringEvent
from app.models.user import User
from app.schemas.proctoring_event import (
    ProctoringEventCreate,
    ProctoringEventResponse,
)
from app.services.proctoring_service import (
    get_proctoring_events,
    record_proctoring_event,
)

router = APIRouter(
    prefix="/attempts/{attempt_id}/proctoring-events",
    tags=["Proctoring"],
)


def get_authorized_attempt(
    attempt_id: int,
    db: Session,
    current_user: User,
) -> Attempt:
    """Allow admins or the candidate who owns the attempt."""
    attempt = db.get(Attempt, attempt_id)

    if attempt is None:
        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    if (
        current_user.role != "ADMIN"
        and attempt.candidate_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to access this attempt",
        )

    return attempt


@router.post("/", response_model=ProctoringEventResponse, status_code=201)
def create_proctoring_event(
    attempt_id: int,
    event_data: ProctoringEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = get_authorized_attempt(attempt_id, db, current_user)

    # Only the candidate's own active attempt can receive new events.
    if attempt.candidate_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the candidate can report events for their attempt",
        )

    try:
        return record_proctoring_event(
            db=db,
            attempt_id=attempt_id,
            event_type=event_data.event_type,
            severity=event_data.severity,
            evidence_reference=event_data.evidence_reference,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == "Attempt not found" else 400
        raise HTTPException(
            status_code=status_code,
            detail=message,
        ) from exc


@router.get("/", response_model=list[ProctoringEventResponse])
def list_proctoring_events(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_authorized_attempt(attempt_id, db, current_user)

    try:
        return get_proctoring_events(
            db=db,
            attempt_id=attempt_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc


@router.patch("/{event_id}/review", response_model=ProctoringEventResponse)
def review_proctoring_event(
    attempt_id: int,
    event_id: int,
    review_status: str,
    review_comment: str | None = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    allowed_statuses = {"REVIEWED", "DISMISSED", "ESCALATED"}
    normalized_status = review_status.strip().upper()

    if normalized_status not in allowed_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"review_status must be one of {sorted(allowed_statuses)}",
        )

    event = (
        db.query(ProctoringEvent)
        .filter(
            ProctoringEvent.id == event_id,
            ProctoringEvent.attempt_id == attempt_id,
        )
        .first()
    )

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="Proctoring event not found for this attempt.",
        )

    event.review_status = normalized_status
    event.reviewed_by = current_admin.id
    event.review_comment = (
        review_comment.strip() if review_comment else None
    )

    try:
        db.commit()
        db.refresh(event)
        return event
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the proctoring event review.",
        ) from None
