from pydantic import BaseModel
from datetime import datetime


# ── Requests ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    client_name: str = ""
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


class ProjectOut(BaseModel):
    id: int
    name: str
    client_name: str
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
