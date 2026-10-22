
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.schemas.test_case import TestCaseCreate, TestCaseResponse
from app.services.test_case_service import (
    create_test_case,
    get_test_cases,
)

router = APIRouter(tags=["Test Cases"])


@router.post(
    "/questions/{question_id}/test-cases",
    response_model=TestCaseResponse,
    status_code=201,
)
def add_test_case(
    question_id: int,
    data: TestCaseCreate,
    db: Session = Depends(get_db),
):
    if question_id <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid question ID",
        )

    if data.question_id != question_id:
        raise HTTPException(
            status_code=400,
            detail="Question ID in the URL and body must match",
        )

    return create_test_case(db, question_id, data)


@router.get(
    "/questions/{question_id}/test-cases",
    response_model=list[TestCaseResponse],
)
def list_test_cases(
    question_id: int,
    db: Session = Depends(get_db),
):
    if question_id <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid question ID",
        )

    return get_test_cases(db, question_id)
