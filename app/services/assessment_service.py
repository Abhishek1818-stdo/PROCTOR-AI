
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Assessment
from app.schemas.assessment import AssessmentCreate


def create_assessment(
    db: Session,
    assessment_data: AssessmentCreate,
) -> Assessment:
    assessment = Assessment(
        title=assessment_data.title,
        description=assessment_data.description,
        duration_minutes=assessment_data.duration_minutes,
        total_marks=assessment_data.total_marks,
    )

    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    return assessment


def get_assessments(db: Session) -> list[Assessment]:
    statement = (
        select(Assessment)
        .where(Assessment.is_active.is_(True))
        .order_by(Assessment.id.desc())
    )

    return list(db.scalars(statement).all())


def get_assessment_by_id(
    db: Session,
    assessment_id: int,
) -> Assessment | None:
    return db.get(Assessment, assessment_id)
