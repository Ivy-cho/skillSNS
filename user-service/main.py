import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.api.routes.auth import router as auth_router
from app.db.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="skillSNS - User Service", version="1.0.0", lifespan=lifespan)

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
