import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from storage3.utils import StorageException

from app.api.routes.auth import AVATAR_BUCKET, MAX_AVATAR_SIZE, supabase_admin
from app.api.routes.auth import router as auth_router
from app.db.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Base.metadata.create_all은 없는 테이블만 만들고 기존 테이블에 컬럼을 추가하진
        # 않는다 — 마이그레이션 도구가 없는 프로젝트라 신규 컬럼은 이렇게 직접 얹는다.
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT"))

    try:
        supabase_admin.storage.create_bucket(
            AVATAR_BUCKET,
            options={"public": True, "file_size_limit": MAX_AVATAR_SIZE},
        )
    except StorageException:
        pass  # 버킷이 이미 있으면 그냥 넘어간다 (수동 생성용 스텝이 없는 프로젝트라 매 기동 시 확인)

    yield


app = FastAPI(title="skillSNS - User Service", version="1.0.0", lifespan=lifespan)

# 프론트(frontend/, Next.js dev server)가 브라우저에서 직접 이 서버를 호출한다.
# 로컬 개발용 origin만 허용 — 배포 시엔 실제 프론트 도메인으로 좁혀야 한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "user-service"}


# ==============================================================
# 테스트 프론트엔드 (삭제 예정)
# 삭제 방법: 아래 두 줄 + test_frontend/ 폴더 삭제
# ==============================================================
from fastapi.staticfiles import StaticFiles  # noqa: E402
app.mount("/", StaticFiles(directory="test_frontend", html=True), name="test_frontend")
