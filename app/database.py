from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

connect_args = {}
engine_kwargs = {}

if settings.async_database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    engine_kwargs = {"pool_size": 20, "max_overflow": 10}

engine = create_async_engine(
    settings.async_database_url, connect_args=connect_args, **engine_kwargs
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    # Clean up ghost types and broken tables from failed deploys (Postgres only)
    if not engine.url.drivername.startswith("sqlite"):
        from sqlalchemy import text
        # Ghost composite types left by failed CREATE TABLE
        for ghost_type in ("users", "app_users"):
            try:
                async with engine.begin() as c:
                    await c.execute(text(f"DROP TYPE IF EXISTS {ghost_type} CASCADE"))
            except Exception:
                pass
        # Fix user_sessions if its id column lost its auto-increment sequence
        try:
            async with engine.begin() as c:
                row = await c.execute(text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_name='user_sessions' AND column_name='id'"
                ))
                result = row.scalar_one_or_none()
                if result is None:
                    # Table exists but id has no default → broken, recreate it
                    await c.execute(text("DROP TABLE IF EXISTS user_sessions CASCADE"))
        except Exception:
            pass

    # Create tables (skips already-existing ones)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add new columns to existing tables (Postgres only, ALTER TABLE is idempotent with IF NOT EXISTS-style checks)
    if not engine.url.drivername.startswith("sqlite"):
        from sqlalchemy import text
        migrations = [
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email VARCHAR(300) DEFAULT ''",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL",
        ]
        for sql in migrations:
            try:
                async with engine.begin() as c:
                    await c.execute(text(sql))
            except Exception:
                pass
