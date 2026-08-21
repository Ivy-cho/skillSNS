import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.api.routes.chat import router as chat_router
from app.api.routes.scrap import router as scrap_router
from app.api.routes.skill_creation import router as skill_creation_router
from app.api.routes.skills import router as skills_router
from app.core.config import settings
from app.db.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Base.metadata.create_all은 없는 테이블만 만들고 기존 테이블에 컬럼을 추가하진
        # 않는다 — 채팅 목록 정렬용으로 새로 추가한 컬럼이라 직접 얹는다.
        await conn.execute(
            text(
                "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS "
                "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE skills ADD COLUMN IF NOT EXISTS "
                "view_count INTEGER NOT NULL DEFAULT 0"
            )
        )

    # AsyncPostgresSaver.from_conn_string()은 커넥션 하나를 앱 수명 내내 물고 있어서,
    # Supabase 쪽 유휴 타임아웃에 걸려 끊기면 재연결 없이 계속 에러를 낸다(연결이 죽어도
    # 스스로 알아채지 못함). 대신 풀을 직접 만들어서, 매 체크아웃마다 살아있는지 확인하고
    # (check=check_connection) 오래된 커넥션은 자동으로 회수·재생성되게 한다.
    async with AsyncConnectionPool(
        conninfo=settings.CHECKPOINTER_URL,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        check=AsyncConnectionPool.check_connection,
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()
        app.state.checkpointer = checkpointer
        yield


app = FastAPI(title="skillSNS - Skill Service", version="1.0.0", lifespan=lifespan)

# 프론트(frontend/)가 브라우저에서 직접 이 서버를 호출한다. 허용 오리진은
# CORS_ORIGINS 환경변수로 관리(기본값 로컬 전용) — 배포 도메인은 .env에서 추가한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills_router)
app.include_router(chat_router)
app.include_router(skill_creation_router)
app.include_router(scrap_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "skill-service"}
