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
    # Clean up ghost types from failed deploys (Postgres only)
    if not engine.url.drivername.startswith("sqlite"):
        from sqlalchemy import text
        for ghost_type in ("users", "app_users"):
            try:
                async with engine.begin() as cleanup_conn:
                    await cleanup_conn.execute(text(f"DROP TYPE IF EXISTS {ghost_type} CASCADE"))
            except Exception:
                pass  # ignore — type may not exist or may be attached to a real table

    # Now create tables on a fresh connection
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
