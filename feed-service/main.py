from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.feed import router as feed_router

app = FastAPI(title="skillSNS - Feed Service", version="1.0.0")

# 프론트(frontend/, Next.js dev server)가 브라우저에서 직접 이 서버를 호출한다.
# 로컬 개발용 origin만 허용 — 배포 시엔 실제 프론트 도메인으로 좁혀야 한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "feed-service"}
