from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Answer(Base):
    __tablename__ = "answers"

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

    answer_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    selected_option: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    is_correct: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    marks_awarded: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    time_spent: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    marked_for_review: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )