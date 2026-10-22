
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_admin
from app.database.dependencies import get_db
from app.models.attempt import Attempt
from app.models.user import User

router = APIRouter(
    prefix="/admin/dashboard",
    tags=["Admin Dashboard"],
)


@router.get("/attempts")
def get_dashboard_attempts(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    attempts = (
        db.query(Attempt)
        .order_by(Attempt.started_at.desc())
        .all()
    )

    # Load candidate details without exposing passwords or tokens.
    candidate_ids = {
        attempt.candidate_id for attempt in attempts
    }

    candidates = {}
    if candidate_ids:
        candidate_rows = (
            db.query(User)
            .filter(User.id.in_(candidate_ids))
            .all()
        )
        candidates = {
            candidate.id: candidate
            for candidate in candidate_rows
        }

    results = []

    for attempt in attempts:
        candidate = candidates.get(attempt.candidate_id)

        results.append(
            {
                "attempt_id": attempt.id,
                "assessment_id": attempt.assessment_id,
                "candidate_id": attempt.candidate_id,
                "candidate_name": (
                    candidate.full_name if candidate else "Unknown"
                ),
                "candidate_email": (
                    candidate.email if candidate else "Unknown"
                ),
                "started_at": attempt.started_at,
                "submitted_at": attempt.submitted_at,
                "status": attempt.status,
                "score": attempt.score,
                "percentage": attempt.percentage,
                "risk_score": attempt.risk_score,
                "risk_level": attempt.risk_level,
            }
        )

    return results
