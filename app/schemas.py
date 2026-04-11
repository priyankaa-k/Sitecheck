from pydantic import BaseModel
from datetime import datetime


# ── Auth ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "engineer"  # admin, engineer, project_manager, contractor

class LoginRequest(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    model_config = {"from_attributes": True}


# ── Requests ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    client_name: str = ""
    client_email: str = ""
    site_address: str = ""
    start_date: str | None = None
    supervisor: str = ""


class PhaseCreate(BaseModel):
    name: str
    sort_order: int | None = None


class CategoryCreate(BaseModel):
    name: str
    sort_order: int | None = None


class ItemCreate(BaseModel):
    description: str
    tag: str = "VERIFY"
    sort_order: int | None = None


class StatusUpdate(BaseModel):
    status: str


class CommentUpdate(BaseModel):
    comment: str = ""


class NoteCreate(BaseModel):
    content: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_name: str | None = None
    client_email: str | None = None
    site_address: str | None = None
    start_date: str | None = None
    supervisor: str | None = None


class ItemUpdate(BaseModel):
    description: str | None = None
    tag: str | None = None


class ItemMove(BaseModel):
    target_category_id: int


class InspectionStart(BaseModel):
    pass


class InspectionStop(BaseModel):
    duration_seconds: int
    note: str = ""


class EventCreate(BaseModel):
    project_id: int
    title: str
    event_date: str          # YYYY-MM-DD
    event_time: str | None = None  # HH:MM
    note: str = ""
    notify: bool = False


class EventUpdate(BaseModel):
    title: str | None = None
    event_date: str | None = None
    event_time: str | None = None
    note: str | None = None
    notify: bool | None = None


# ── Responses ─────────────────────────────────────────────────────────

class ItemOut(BaseModel):
    id: int
    description: str
    status: str
    tag: str
    comment: str | None
    is_custom: bool
    sort_order: int
    updated_at: datetime | None
    category_id: int
    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    id: int
    name: str
    sort_order: int
    phase_id: int
    item_count: int = 0
    items: list[ItemOut] = []
    model_config = {"from_attributes": True}


class PhaseOut(BaseModel):
    id: int
    name: str
    sort_order: int
    project_id: int
    category_count: int = 0
    categories: list[CategoryOut] = []
    # stats
    total_items: int = 0
    confirmed_count: int = 0
    flagged_count: int = 0
    unchecked_count: int = 0
    na_count: int = 0
    progress_pct: int = 0
    is_complete: bool = False
    model_config = {"from_attributes": True}


class NoteOut(BaseModel):
    id: int
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ClientOut(BaseModel):
    id: int
    name: str
    email: str
    company: str
    phone: str
    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: int
    name: str
    client_name: str
    client_email: str = ""
    site_address: str
    start_date: str | None
    supervisor: str
    is_template: bool
    is_archived: bool
    created_at: datetime
    phase_count: int = 0
    phases: list[PhaseOut] = []
    notes: list[NoteOut] = []
    # dashboard stats
    total_items: int = 0
    confirmed_count: int = 0
    flagged_count: int = 0
    unchecked_count: int = 0
    na_count: int = 0
    progress_pct: int = 0
    current_phase: str = ""
    has_flags: bool = False
    model_config = {"from_attributes": True}


class DashboardOut(BaseModel):
    total_flagged: int = 0
    active_projects: list[ProjectOut] = []


class PhaseInspectionOut(BaseModel):
    id: int
    phase_id: int
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
    note: str | None
    total_items: int = 0
    confirmed_count: int = 0
    flagged_count: int = 0
    unchecked_count: int = 0
    na_count: int = 0
    inspector_name: str | None = None
    items_snapshot: str | None = None
    model_config = {"from_attributes": True}


class InspectionEventOut(BaseModel):
    id: int
    project_id: int
    title: str
    event_date: str
    event_time: str | None
    note: str | None
    notify: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class SearchResultOut(BaseModel):
    item_id: int
    description: str
    status: str
    tag: str
    comment: str | None
    phase_name: str
    category_name: str
    phase_id: int
    category_id: int
