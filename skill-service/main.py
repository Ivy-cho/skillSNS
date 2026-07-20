import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.api.routes.chat import router as chat_router
from app.api.routes.skill_creation import router as skill_creation_router
from app.api.routes.skills import router as skills_router
from app.core.config import settings
from app.db.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncPostgresSaver.from_conn_string(settings.CHECKPOINTER_URL) as checkpointer:
        await checkpointer.setup()
        app.state.checkpointer = checkpointer
        yield


app = FastAPI(title="skillSNS - Skill Service", version="1.0.0", lifespan=lifespan)

# 프론트(frontend/, Next.js dev server)가 브라우저에서 직접 이 서버를 호출한다.
# 로컬 개발용 origin만 허용 — 배포 시엔 실제 프론트 도메인으로 좁혀야 한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills_router)
app.include_router(chat_router)
app.include_router(skill_creation_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "skill-service"}


# ==============================================================
# 테스트 프론트엔드 (삭제 예정)
# 삭제 방법: 아래 두 줄 + test_frontend/ 폴더 삭제
# ==============================================================
from fastapi.staticfiles import StaticFiles  # noqa: E402
app.mount("/", StaticFiles(directory="test_frontend", html=True), name="test_frontend")
