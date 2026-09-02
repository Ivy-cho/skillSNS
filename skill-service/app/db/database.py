from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Supabase(PgBouncer, 트랜잭션 모드) 호환:
# - anonymous prepared statement(statement_cache_size=0 등)로 재시작·pooler 충돌 방지
# - 커넥션 풀을 재사용해 요청마다 붙던 TCP/TLS 핸드셰이크 비용을 없앤다. PgBouncer가 유휴
#   커넥션을 끊으므로 pool_pre_ping으로 체크아웃 시 죽은 커넥션을 걸러내고, pool_recycle로
#   오래된 커넥션을 주기적으로 새로 맺는다. 무료 티어 커넥션 한도를 감안해 풀은 작게 잡는다.
# (대화·스킬 생성이 쓰는 LangGraph 체크포인터는 이 엔진과 별개로 main.py에서 psycopg 풀을 따로 만든다.)
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: "",
    },
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
