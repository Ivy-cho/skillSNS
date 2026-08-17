from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# feed-service는 user-service/skill-service가 소유한 테이블(users/skills/scraps)을 읽기
# 전용으로 조회만 한다 — 셋 다 같은 Supabase Postgres 인스턴스를 쓴다(서비스별로 pooler
# 포트만 다름). 그래서 여기엔 Base/create_all이 없다: 이 서비스가 스키마를 만들거나
# 바꿀 일이 없어야 한다.
engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: "",
    },
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
