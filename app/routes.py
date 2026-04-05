from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Project, Phase, Category, ChecklistItem, ProjectNote, VALID_STATUSES, VALID_TAGS
from app.schemas import (
    ProjectCreate, PhaseCreate, CategoryCreate, ItemCreate,
    StatusUpdate, CommentUpdate, NoteCreate,
    ProjectOut, PhaseOut, CategoryOut, ItemOut, NoteOut,
    DashboardOut, SearchResultOut,
)
from app.template_data import MASTER_TEMPLATE
from datetime import datetime, timezone

router = APIRouter(prefix="/api")


# ── Helpers ───────────────────────────────────────────────────────────

def _phase_stats(phase):
    """Compute stats for a phase from its loaded categories/items."""
    total = 0
    counts = {"unchecked": 0, "flagged": 0, "confirmed": 0, "na": 0}
    for cat in phase.categories:
        for item in cat.items:
            total += 1
            counts[item.status] = counts.get(item.status, 0) + 1
    active = total - counts["na"]
    pct = round((counts["confirmed"] / active) * 100) if active > 0 else (100 if total > 0 else 0)
    is_complete = active > 0 and counts["confirmed"] == active
    return total, counts, pct, is_complete


def _project_stats(project):
    """Compute aggregate stats across all phases."""
    total = 0
    counts = {"unchecked": 0, "flagged": 0, "confirmed": 0, "na": 0}
    current_phase = ""
    for phase in project.phases:
        pt, pc, _, phase_complete = _phase_stats(phase)
        total += pt
        for k in counts:
            counts[k] += pc[k]
        if not phase_complete and not current_phase and pt > 0:
            current_phase = phase.name
    active = total - counts["na"]
    pct = round((counts["confirmed"] / active) * 100) if active > 0 else (100 if total > 0 else 0)
    return total, counts, pct, current_phase


def _project_to_out(project, include_phases=False, include_notes=False):
    total, counts, pct, current_phase = _project_stats(project)
    phases = []
    if include_phases:
        for ph in project.phases:
            phases.append(_phase_to_out(ph, include_categories=True))
    return ProjectOut(
        id=project.id, name=project.name, client_name=project.client_name,
        site_address=project.site_address, start_date=project.start_date,
        supervisor=project.supervisor, is_template=project.is_template,
        is_archived=project.is_archived, created_at=project.created_at,
        phase_count=len(project.phases), phases=phases,
        notes=[NoteOut(id=n.id, content=n.content, created_at=n.created_at) for n in project.notes] if include_notes else [],
        total_items=total, confirmed_count=counts["confirmed"],
        flagged_count=counts["flagged"], unchecked_count=counts["unchecked"],
        na_count=counts["na"], progress_pct=pct, current_phase=current_phase,
        has_flags=counts["flagged"] > 0,
    )


def _phase_to_out(phase, include_categories=False):
    total, counts, pct, is_complete = _phase_stats(phase)
    categories = []
    if include_categories:
        for c in phase.categories:
            categories.append(CategoryOut(
                id=c.id, name=c.name, sort_order=c.sort_order,
                phase_id=c.phase_id, item_count=len(c.items),
                items=[ItemOut(
                    id=i.id, description=i.description, status=i.status,
                    tag=i.tag, comment=i.comment, is_custom=i.is_custom,
                    sort_order=i.sort_order, updated_at=i.updated_at,
                    category_id=i.category_id,
                ) for i in c.items],
            ))
    return PhaseOut(
        id=phase.id, name=phase.name, sort_order=phase.sort_order,
        project_id=phase.project_id, category_count=len(phase.categories),
        categories=categories, total_items=total,
        confirmed_count=counts["confirmed"], flagged_count=counts["flagged"],
        unchecked_count=counts["unchecked"], na_count=counts["na"],
        progress_pct=pct, is_complete=is_complete,
    )


# ── Dashboard ─────────────────────────────────────────────────────────

def _project_eager_options():
    return [
        selectinload(Project.phases)
        .selectinload(Phase.categories)
        .selectinload(Category.items),
        selectinload(Project.notes),
    ]


def _phase_eager_options():
    return [
        selectinload(Phase.categories)
        .selectinload(Category.items),
    ]


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project)
        .where(Project.is_template == False, Project.is_archived == False)
        .options(*_project_eager_options())
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().unique().all()
    total_flagged = 0
    out = []
    for p in projects:
        po = _project_to_out(p)
        total_flagged += po.flagged_count
        out.append(po)
    return DashboardOut(total_flagged=total_flagged, active_projects=out)


# ── Projects ──────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(
    archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .where(Project.is_template == False, Project.is_archived == archived)
        .options(*_project_eager_options())
        .order_by(Project.created_at.desc())
    )
    return [_project_to_out(p) for p in result.scalars().unique().all()]


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(
        name=data.name, client_name=data.client_name,
        site_address=data.site_address, start_date=data.start_date,
        supervisor=data.supervisor,
    )
    db.add(project)
    await db.flush()

    # Clone from master template
    template_result = await db.execute(
        select(Project)
        .where(Project.is_template == True)
        .options(*_project_eager_options())
        .limit(1)
    )
    template = template_result.scalar_one_or_none()

    if template:
        for tph in template.phases:
            phase = Phase(name=tph.name, sort_order=tph.sort_order, project_id=project.id)
            db.add(phase)
            await db.flush()
            for tcat in tph.categories:
                cat = Category(name=tcat.name, sort_order=tcat.sort_order, phase_id=phase.id)
                db.add(cat)
                await db.flush()
                for titem in tcat.items:
                    item = ChecklistItem(
                        description=titem.description, tag=titem.tag,
                        is_custom=titem.is_custom, sort_order=titem.sort_order,
                        category_id=cat.id,
                    )
                    db.add(item)

    await db.commit()

    # Re-fetch with all relationships loaded
    project = await _load_project(db, project.id)
    return _project_to_out(project)


async def _load_project(db: AsyncSession, project_id: int):
    """Load a project with all nested relationships eagerly."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(*_project_eager_options())
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await _load_project(db, project_id)
    return _project_to_out(project, include_phases=True, include_notes=True)


@router.patch("/projects/{project_id}/archive", response_model=ProjectOut)
async def archive_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    project.is_archived = True
    await db.commit()
    project = await _load_project(db, project_id)
    return _project_to_out(project)


@router.patch("/projects/{project_id}/restore", response_model=ProjectOut)
async def restore_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    project.is_archived = False
    await db.commit()
    project = await _load_project(db, project_id)
    return _project_to_out(project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    await db.delete(project)
    await db.commit()


# ── Phases ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/phases", response_model=PhaseOut, status_code=201)
async def create_phase(project_id: int, data: PhaseCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    count = await db.scalar(select(func.count()).where(Phase.project_id == project_id))
    phase = Phase(
        name=data.name,
        sort_order=data.sort_order if data.sort_order is not None else count,
        project_id=project_id,
    )
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    return _phase_to_out(phase)


@router.get("/phases/{phase_id}", response_model=PhaseOut)
async def get_phase(phase_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Phase).where(Phase.id == phase_id).options(*_phase_eager_options())
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(404)
    return _phase_to_out(phase, include_categories=True)


@router.delete("/phases/{phase_id}", status_code=204)
async def delete_phase(phase_id: int, db: AsyncSession = Depends(get_db)):
    phase = await db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(404)
    await db.delete(phase)
    await db.commit()


# ── Categories ────────────────────────────────────────────────────────

@router.post("/phases/{phase_id}/categories", response_model=CategoryOut, status_code=201)
async def create_category(phase_id: int, data: CategoryCreate, db: AsyncSession = Depends(get_db)):
    phase = await db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(404)
    count = await db.scalar(select(func.count()).where(Category.phase_id == phase_id))
    category = Category(
        name=data.name,
        sort_order=data.sort_order if data.sort_order is not None else count,
        phase_id=phase_id,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return CategoryOut(
        id=category.id, name=category.name, sort_order=category.sort_order,
        phase_id=category.phase_id, item_count=0,
    )


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(404)
    await db.delete(category)
    await db.commit()


# ── Checklist Items ───────────────────────────────────────────────────

@router.post("/categories/{category_id}/items", response_model=ItemOut, status_code=201)
async def create_item(category_id: int, data: ItemCreate, db: AsyncSession = Depends(get_db)):
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(404)
    if data.tag not in VALID_TAGS:
        raise HTTPException(400, f"Invalid tag. Must be one of: {VALID_TAGS}")
    count = await db.scalar(select(func.count()).where(ChecklistItem.category_id == category_id))
    item = ChecklistItem(
        description=data.description, tag=data.tag, is_custom=True,
        sort_order=data.sort_order if data.sort_order is not None else count,
        category_id=category_id,
    )
    db.add(item)

    # Sync new item to template and all other projects
    phase = await db.get(Phase, category.phase_id)
    if phase:
        project = await db.get(Project, phase.project_id)
        if project and not project.is_template:
            await _sync_item_to_all(db, project.id, phase.name, category.name, data.description, data.tag)

    await db.commit()
    await db.refresh(item)
    return ItemOut(
        id=item.id, description=item.description, status=item.status,
        tag=item.tag, comment=item.comment, is_custom=item.is_custom,
        sort_order=item.sort_order, updated_at=item.updated_at,
        category_id=item.category_id,
    )


async def _add_item_to_project(db: AsyncSession, project, phase_name: str, category_name: str, description: str, tag: str):
    """Add an item to a project's matching phase/category, creating them if needed."""
    # Find matching phase
    target_phase = None
    for ph in project.phases:
        if ph.name == phase_name:
            target_phase = ph
            break
    if not target_phase:
        count = len(project.phases)
        target_phase = Phase(name=phase_name, sort_order=count, project_id=project.id)
        db.add(target_phase)
        await db.flush()

    # Find matching category
    target_cat = None
    for cat in target_phase.categories:
        if cat.name == category_name:
            target_cat = cat
            break
    if not target_cat:
        count = len(target_phase.categories)
        target_cat = Category(name=category_name, sort_order=count, phase_id=target_phase.id)
        db.add(target_cat)
        await db.flush()

    # Check if item already exists in this category (avoid duplicates)
    for existing in target_cat.items:
        if existing.description == description:
            return

    count = len(target_cat.items)
    new_item = ChecklistItem(
        description=description, tag=tag, is_custom=True,
        sort_order=count, category_id=target_cat.id,
    )
    db.add(new_item)


async def _sync_item_to_all(db: AsyncSession, source_project_id: int, phase_name: str, category_name: str, description: str, tag: str):
    """Sync a new item to the master template and all other non-archived projects."""
    result = await db.execute(
        select(Project)
        .where(Project.id != source_project_id, Project.is_archived == False)
        .options(*_project_eager_options())
    )
    projects = result.scalars().unique().all()
    for project in projects:
        await _add_item_to_project(db, project, phase_name, category_name, description, tag)


@router.patch("/items/{item_id}/status", response_model=ItemOut)
async def update_status(item_id: int, data: StatusUpdate, db: AsyncSession = Depends(get_db)):
    if data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {VALID_STATUSES}")
    item = await db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404)
    item.status = data.status
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return ItemOut(
        id=item.id, description=item.description, status=item.status,
        tag=item.tag, comment=item.comment, is_custom=item.is_custom,
        sort_order=item.sort_order, updated_at=item.updated_at,
        category_id=item.category_id,
    )


@router.patch("/items/bulk-status")
async def bulk_update_status(
    item_ids: list[int] = Query(...),
    status: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status")
    result = await db.execute(select(ChecklistItem).where(ChecklistItem.id.in_(item_ids)))
    items = result.scalars().all()
    now = datetime.now(timezone.utc)
    for item in items:
        item.status = status
        item.updated_at = now
    await db.commit()
    return {"updated": len(items)}


@router.patch("/items/{item_id}/comment", response_model=ItemOut)
async def update_comment(item_id: int, data: CommentUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404)
    item.comment = data.comment if data.comment else None
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return ItemOut(
        id=item.id, description=item.description, status=item.status,
        tag=item.tag, comment=item.comment, is_custom=item.is_custom,
        sort_order=item.sort_order, updated_at=item.updated_at,
        category_id=item.category_id,
    )


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(404)
    await db.delete(item)
    await db.commit()


# ── Project Notes ─────────────────────────────────────────────────────

@router.post("/projects/{project_id}/notes", response_model=NoteOut, status_code=201)
async def create_note(project_id: int, data: NoteCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    note = ProjectNote(content=data.content, project_id=project_id)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteOut(id=note.id, content=note.content, created_at=note.created_at)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: int, db: AsyncSession = Depends(get_db)):
    note = await db.get(ProjectNote, note_id)
    if not note:
        raise HTTPException(404)
    await db.delete(note)
    await db.commit()


# ── Search ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/search", response_model=list[SearchResultOut])
async def search_items(
    project_id: int,
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    project = await _load_project(db, project_id)
    results = []
    query = q.lower()
    for phase in project.phases:
        for cat in phase.categories:
            for item in cat.items:
                if query in item.description.lower() or (item.comment and query in item.comment.lower()):
                    results.append(SearchResultOut(
                        item_id=item.id, description=item.description,
                        status=item.status, tag=item.tag, comment=item.comment,
                        phase_name=phase.name, category_name=cat.name,
                        phase_id=phase.id, category_id=cat.id,
                    ))
    return results


# ── Flagged items (cross-project) ────────────────────────────────────

@router.get("/flagged", response_model=list[SearchResultOut])
async def get_flagged_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project)
        .where(Project.is_template == False, Project.is_archived == False)
        .options(*_project_eager_options())
    )
    projects = result.scalars().unique().all()
    flagged = []
    for project in projects:
        for phase in project.phases:
            for cat in phase.categories:
                for item in cat.items:
                    if item.status == "flagged":
                        flagged.append(SearchResultOut(
                            item_id=item.id, description=item.description,
                            status=item.status, tag=item.tag, comment=item.comment,
                            phase_name=f"{project.name} → {phase.name}",
                            category_name=cat.name,
                            phase_id=phase.id, category_id=cat.id,
                        ))
    return flagged


# ── Template ──────────────────────────────────────────────────────────

@router.get("/template", response_model=ProjectOut)
async def get_template(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project)
        .where(Project.is_template == True)
        .options(*_project_eager_options())
        .limit(1)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "No template found. Seed the database first.")
    return _project_to_out(template, include_phases=True)


@router.post("/template/seed", status_code=201)
async def seed_template(db: AsyncSession = Depends(get_db)):
    """Create or re-create the master template from built-in data."""
    # Delete existing template
    result = await db.execute(select(Project).where(Project.is_template == True))
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.flush()

    template = Project(name="Master Template", is_template=True)
    db.add(template)
    await db.flush()

    for phase_order, (phase_name, categories) in enumerate(MASTER_TEMPLATE.items()):
        phase = Phase(name=phase_name, sort_order=phase_order, project_id=template.id)
        db.add(phase)
        await db.flush()
        for cat_order, (cat_name, items) in enumerate(categories.items()):
            category = Category(name=cat_name, sort_order=cat_order, phase_id=phase.id)
            db.add(category)
            await db.flush()
            for item_order, (desc, tag) in enumerate(items):
                item = ChecklistItem(
                    description=desc, tag=tag, sort_order=item_order,
                    category_id=category.id,
                )
                db.add(item)

    await db.commit()
    return {"message": "Master template seeded", "phases": len(MASTER_TEMPLATE)}
