from app.database.base import Base
from app.database.connection import engine

from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.coding_submission import CodingSubmission
from app.models.proctoring_event import ProctoringEvent
from app.models.test_case import TestCase
from app.models.assessment import Assessment
from app.models.question import Question


Base.metadata.create_all(bind=engine)

print("Database tables created or verified successfully!")