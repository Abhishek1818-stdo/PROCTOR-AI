
from sqlalchemy.orm import Session

from app.models.test_case import TestCase
from app.schemas.test_case import TestCaseCreate


def create_test_case(
    db: Session,
    question_id: int,
    data: TestCaseCreate,
) -> TestCase:
    test_case = TestCase(
        question_id=question_id,
        input_data=data.input_data,
        expected_output=data.expected_output,
        marks=data.marks,
        is_hidden=data.is_hidden,
    )

    db.add(test_case)
    db.commit()
    db.refresh(test_case)

    return test_case


def get_test_cases(
    db: Session,
    question_id: int,
) -> list[TestCase]:
    return (
        db.query(TestCase)
        .filter(TestCase.question_id == question_id)
        .order_by(TestCase.id.asc())
        .all()
    )