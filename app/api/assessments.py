
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.api.auth import get_current_admin
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentResponse,
)
from app.services.assessment_service import (
    create_assessment,
    get_assessments,
    get_assessment_by_id,
)

router = APIRouter(
    prefix="/assessments",
    tags=["Assessments"],
)


# Admin only: Create an assessment
@router.post(
    "/",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_new_assessment(
    assessment_data: AssessmentCreate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return create_assessment(db, assessment_data)


# Admins and candidates: List assessments
@router.get(
    "/",
    response_model=list[AssessmentResponse],
)
def list_assessments(
    db: Session = Depends(get_db),
):
    return get_assessments(db)


# Admins and candidates: Get one assessment
@router.get(
    "/{assessment_id}",
    response_model=AssessmentResponse,
)
def get_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
):
    assessment = get_assessment_by_id(db, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    return assessment
