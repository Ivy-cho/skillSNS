from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# feed-service는 user-service/skill-service가 소유한 테이블(users/skills/scraps)을 읽기
# 전용으로 조회만 한다 — 셋 다 같은 Supabase Postgres 인스턴스를 쓴다(서비스별로 pooler
# 포트만 다름). 그래서 여기엔 Base/create_all이 없다: 이 서비스가 스키마를 만들거나
# 바꿀 일이 없어야 한다.
#
# Supabase(PgBouncer, 트랜잭션 모드) 호환:
# - anonymous prepared statement(statement_cache_size=0 등)로 재시작·pooler 충돌 방지
# - 커넥션 풀을 재사용해 요청마다 붙던 TCP/TLS 핸드셰이크 비용을 없앤다. PgBouncer가 유휴
#   커넥션을 끊으므로 pool_pre_ping으로 체크아웃 시 죽은 커넥션을 걸러내고, pool_recycle로
#   오래된 커넥션을 주기적으로 새로 맺는다. 무료 티어 커넥션 한도를 감안해 풀은 작게 잡는다.
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


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
