from datetime import datetime, timezone, timedelta
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import hashlib, secrets


class User(Base):
    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(300), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="engineer")  # admin, engineer, project_manager, contractor
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"{salt}:{h}"

    def verify_password(self, password: str) -> bool:
        salt, h = self.password_hash.split(":")
        return hashlib.sha256((salt + password).encode()).hexdigest() == h


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped["User"] = relationship()


#create projects
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_name: Mapped[str] = mapped_column(String(200), default="")
    site_address: Mapped[str] = mapped_column(String(400), default="")
    start_date: Mapped[str | None] = mapped_column(String(20), default=None)
    supervisor: Mapped[str] = mapped_column(String(200), default="")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    phases: Mapped[list["Phase"]] = relationship(
        back_populates="project", cascade="all, delete-orphan",
        order_by="Phase.sort_order", lazy="selectin",
    )
    notes: Mapped[list["ProjectNote"]] = relationship(
        back_populates="project", cascade="all, delete-orphan",
        order_by="ProjectNote.created_at.desc()", lazy="selectin",
    )


class ProjectNote(Base):
    __tablename__ = "project_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="notes")


class Phase(Base):
    __tablename__ = "phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="phases")
    categories: Mapped[list["Category"]] = relationship(
        back_populates="phase", cascade="all, delete-orphan",
        order_by="Category.sort_order", lazy="selectin",
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    phase_id: Mapped[int] = mapped_column(ForeignKey("phases.id"), nullable=False)

    phase: Mapped["Phase"] = relationship(back_populates="categories")
    items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="category", cascade="all, delete-orphan",
        order_by="ChecklistItem.sort_order", lazy="selectin",
    )


VALID_STATUSES = ["unchecked", "flagged", "confirmed", "na"]
VALID_TAGS = ["VERIFY", "ACTION", "CLIENT", "PRIOR TO ORDER", "PRIOR TO POUR", "INFORM CONTRACTOR", "CUSTOM"]


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="unchecked", nullable=False)
    tag: Mapped[str] = mapped_column(String(30), default="VERIFY", nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, default=None)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)

    category: Mapped["Category"] = relationship(back_populates="items")


class PhaseInspection(Base):
    __tablename__ = "phase_inspections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phase_id: Mapped[int] = mapped_column(ForeignKey("phases.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(Text, default=None)
    # Snapshot of phase state when inspection stopped
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    confirmed_count: Mapped[int] = mapped_column(Integer, default=0)
    flagged_count: Mapped[int] = mapped_column(Integer, default=0)
    unchecked_count: Mapped[int] = mapped_column(Integer, default=0)
    na_count: Mapped[int] = mapped_column(Integer, default=0)
    inspector_name: Mapped[str | None] = mapped_column(String(200), default=None)
    items_snapshot: Mapped[str | None] = mapped_column(Text, default=None)  # JSON: {"confirmed":[...], "flagged":[...], ...}

    phase: Mapped["Phase"] = relationship()


class InspectionEvent(Base):
    __tablename__ = "inspection_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    event_date: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    event_time: Mapped[str | None] = mapped_column(String(10), default=None)  # HH:MM
    note: Mapped[str | None] = mapped_column(Text, default=None)
    notify: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship()
