
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Assessment
from app.models.question import Question
from app.schemas.question import QuestionCreate


def create_question(
    db: Session,
    assessment_id: int,
    question_data: QuestionCreate,
) -> Question | None:
    # Check whether the assessment exists
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        return None

    # Create the question
    question = Question(
        assessment_id=assessment_id,
        question_text=question_data.question_text,
        option_a=question_data.option_a,
        option_b=question_data.option_b,
        option_c=question_data.option_c,
        option_d=question_data.option_d,
        correct_answer=question_data.correct_answer,
        marks=question_data.marks,
    )

    db.add(question)
    db.commit()
    db.refresh(question)

    return question


def get_questions_for_assessment(
    db: Session,
    assessment_id: int,
) -> list[Question]:
    statement = (
        select(Question)
        .where(Question.assessment_id == assessment_id)
        .order_by(Question.id)
    )

    return list(db.scalars(statement).all())
