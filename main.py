from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import init_db, async_session
from app.routes import router
from app.models import Project
from app.template_data import MASTER_TEMPLATE
from sqlalchemy import select


async def seed_template_if_needed():
    """Auto-seed master template on first run."""
    from app.models import Phase, Category, ChecklistItem
    async with async_session() as db:
        result = await db.execute(select(Project).where(Project.is_template == True).limit(1))
        if result.scalar_one_or_none():
            return
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
