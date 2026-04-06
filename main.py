from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import init_db, async_session
from app.routes import router
from app.models import Project, Phase, Category, ChecklistItem
from app.template_data import MASTER_TEMPLATE
from sqlalchemy import select
from sqlalchemy.orm import selectinload


async def seed_template_if_needed():
    """Auto-seed master template and sample projects on first run."""
    async with async_session() as db:
        result = await db.execute(select(Project).where(Project.is_template == True).limit(1))
        if result.scalar_one_or_none():
            return

        # Seed master template
        template = Project(name="Master Template", is_template=True)
        db.add(template)
        await db.flush()
        for phase_order, (phase_name, categories) in enumerate(MASTER_TEMPLATE.items()):
            phase = Phase(name=phase_name, sort_order=phase_order, project_id=template.id)
            db.add(phase)
            await db.flush()
            for cat_order, (cat_name, items) in enumerate(categories.items()):
                cat = Category(name=cat_name, sort_order=cat_order, phase_id=phase.id)
                db.add(cat)
                await db.flush()
                for item_order, (desc, tag) in enumerate(items):
                    item = ChecklistItem(description=desc, tag=tag, sort_order=item_order, category_id=cat.id)
                    db.add(item)
            await db.flush()
        await db.commit()
        print("Master template seeded.")

        # Seed 3 sample projects from template
        sample_projects = [
            {"name": "Riverside Residence", "client_name": "James Patterson", "site_address": "42 Riverside Dr, Toronto, ON", "supervisor": "Mike Chen", "start_date": "2026-03-15"},
            {"name": "Oakville Commercial Plaza", "client_name": "Greenfield Developments", "site_address": "180 Lakeshore Rd, Oakville, ON", "supervisor": "Sarah Williams", "start_date": "2026-04-01"},
            {"name": "Maple Heights Townhomes", "client_name": "David & Linda Morrison", "site_address": "15 Maple Ave, Mississauga, ON", "supervisor": "Mike Chen", "start_date": "2026-04-10"},
        ]

        # Reload template with relationships
        result = await db.execute(
            select(Project).where(Project.is_template == True)
            .options(
                selectinload(Project.phases)
                .selectinload(Phase.categories)
                .selectinload(Category.items)
            )
        )
        tmpl = result.scalar_one()

        for sp in sample_projects:
            proj = Project(**sp)
            db.add(proj)
            await db.flush()
            for ph in tmpl.phases:
                new_phase = Phase(name=ph.name, sort_order=ph.sort_order, project_id=proj.id)
                db.add(new_phase)
                await db.flush()
                for cat in ph.categories:
                    new_cat = Category(name=cat.name, sort_order=cat.sort_order, phase_id=new_phase.id)
                    db.add(new_cat)
                    await db.flush()
                    for item in cat.items:
                        new_item = ChecklistItem(
                            description=item.description, tag=item.tag,
                            sort_order=item.sort_order, category_id=new_cat.id,
                        )
                        db.add(new_item)
            await db.flush()

        await db.commit()
        print("3 sample projects seeded.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_template_if_needed()
    yield


app = FastAPI(title="SiteCheck", lifespan=lifespan)
app.include_router(router)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("templates/index.html")
