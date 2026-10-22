from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CodingSubmission(Base):
    __tablename__ = "coding_submissions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("attempts.id"),
        nullable=False,
        index=True,
    )

    question_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )

    language: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    source_code: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    execution_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="PENDING",
    )

    test_cases_passed: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    total_test_cases: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    execution_time: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    memory_used: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )