# SiteCheck

A construction site inspection checklist app built with FastAPI. Create projects from a master template, track checklist items across phases, flag issues, and monitor progress.

## Features

- **Master Template** -- pre-built checklist seeded on first run, cloned into every new project
- **Project Management** -- create, archive, restore, and delete projects
- **Phase/Category/Item hierarchy** -- organise checklist items by construction phase and category
- **Status tracking** -- mark items as confirmed, flagged, unchecked, or N/A
- **Tagging** -- label items (VERIFY, ACTION, CLIENT, PRIOR TO ORDER, PRIOR TO POUR, etc.)
- **Comments & Notes** -- add comments to individual items and notes to projects
- **Search** -- search checklist items within a project
- **Flagged Items dashboard** -- view all flagged items across active projects
- **Progress stats** -- per-phase and per-project completion percentages

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy (async), Pydantic
- **Database:** SQLite (via aiosqlite) / PostgreSQL (via asyncpg)
- **Frontend:** Vanilla JS, HTML, CSS
- **Deployment:** Docker, Render

## Project Structure

```
SiteCheck/
├── main.py                 # App entry point, lifespan, template seeding
├── config.py               # Settings (database URL, secret key)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── render.yaml             # Render deployment config
├── app/
│   ├── database.py         # Async SQLAlchemy engine & session
│   ├── models.py           # ORM models (Project, Phase, Category, ChecklistItem, ProjectNote)
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── routes.py           # API endpoints (/api/...)
│   └── template_data.py    # Built-in master checklist data
├── templates/
│   └── index.html          # Single-page frontend
└── static/
    ├── app.js              # Frontend logic
    └── style.css           # Styles
```

## Getting Started

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the app
uvicorn main:app --reload
```

The app starts at **http://localhost:8000**. The database and master template are created automatically on first run.
