from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.feed import router as feed_router
from app.core.config import settings

app = FastAPI(title="skillSNS - Feed Service", version="1.0.0")

# 프론트(frontend/)가 브라우저에서 직접 이 서버를 호출한다. 허용 오리진은
# CORS_ORIGINS 환경변수로 관리(기본값 로컬 전용) — 배포 도메인은 .env에서 추가한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "feed-service"}
