# 서비스별 기술 설계 문서

skillSNS는 백엔드 3개 + 프론트엔드 1개, 총 **4개의 독립 배포 단위**로 구성된 MSA다.
이 디렉토리는 각 서비스의 **SW 구조 → DB 설계 → 핵심 기술 결정**을 서비스 단위로 정리한다.

| 문서 | 서비스 | 한 줄 |
|---|---|---|
| [user-service.md](user-service.md) | user-service (:8001) | 소셜 로그인, JWT 발급·검증, 프로필/아바타 |
| [skill-service.md](skill-service.md) | skill-service (:8002) | 스킬 CRUD, 스킬 생성 파이프라인(LangGraph), 대화, 스크랩, BYOK, 카테고리명 Agent |
| [feed-service.md](feed-service.md) | feed-service (:8003) | 공개 스킬 피드 조회 전용(읽기 전용 조인) |
| [frontend.md](frontend.md) | frontend (:3000) | Next.js 16 App Router, 모바일 우선 웹앱 |

관련 문서:
- API 요청/응답 계약: [`../specs/skill-service.md`](../specs/skill-service.md), [`../specs/user-service-login.md`](../specs/user-service-login.md)
- 스택 선택 이유 + **배포 & CI/CD**: [`../tech-decisions.md`](../tech-decisions.md)
- 로컬 연동 실행법: [`../frontend-integration.md`](../frontend-integration.md)

---

## 시스템 전경

```
                          ┌───────────────────────┐
                          │   Next.js frontend    │  (브라우저)
                          │   :3000               │
                          └───────────┬───────────┘
             NEXT_PUBLIC_USER_SERVICE_URL │ NEXT_PUBLIC_BACKEND_URL
             NEXT_PUBLIC_FEED_SERVICE_URL │  (프론트가 서비스별 URL을 직접 들고 호출)
          ┌───────────────┬─────────────┴───────────┬───────────────────┐
          ▼               ▼                         ▼                   
 ┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
 │  user-service   │  │  skill-service       │  │  feed-service    │
 │  :8001          │  │  :8002               │  │  :8003           │
 │  FastAPI        │  │  FastAPI + LangGraph │  │  FastAPI         │
 └────────┬────────┘  └──────────┬───────────┘  └────────┬─────────┘
          │  소유: users,        │  소유: skills,        │  소유 테이블 없음
          │  refresh_tokens      │  categories,          │  users/skills/scraps/
          │                      │  chat_sessions,       │  categories를 읽기 전용
          │                      │  skill_drafts,        │  LEFT JOIN
          │                      │  scrap_folders,       │
          │                      │  scraps, user_secrets │
          │                      │  + LangGraph 체크포인터 │
          └──────────────────────┼───────────────────────┘
                                 ▼
                   Supabase PostgreSQL (물리 인스턴스 1개)
```

### 시스템 레벨 설계 원칙

1. **API 게이트웨이 없음** — 프론트가 세 서비스의 URL(`NEXT_PUBLIC_*`)을 각각 들고
   필요한 서비스에 직접 요청한다. 서비스 앞단에 공용 프록시/BFF를 두지 않는다.
2. **서비스 간 직접 호출 없음** — user-service가 skill-service를 부르거나 하지 않는다.
   서비스들이 공유하는 것은 **DB**와 **JWT 서명 비밀(`JWT_SECRET_KEY`)** 둘뿐이다.
3. **인증은 공유 비밀로 검증** — user-service가 HS256으로 서명한 access token을
   skill-service가 같은 비밀로 검증만 한다(user-service에 물어보지 않는다).
   feed-service는 공개 조회라 인증 자체가 없다.
4. **물리 DB는 하나, 스키마 소유권은 서비스별로 분리** — 테이블마다 소유 서비스가
   정해져 있고, 소유 서비스만 그 테이블에 write 한다. 서비스 경계를 넘는 참조
   (`skills.user_id → users.id`)는 값만 맞추고 DB `FOREIGN KEY` 제약은 걸지 않는다.
   같은 서비스가 소유한 테이블 사이에만 FK가 있다.
5. **마이그레이션 도구 없음** — Alembic 등을 쓰지 않는다. 각 서비스가 기동 시
   `Base.metadata.create_all`로 없는 테이블만 만들고, 신규 컬럼은 `main.py` lifespan에서
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 직접 얹는다.
6. **DB 커넥션은 작은 풀 + PgBouncer 호환 설정** — Supabase의 pooler(PgBouncer, 트랜잭션
   모드)를 앞에 두기 때문에 prepared statement 캐시를 비활성화한다(`statement_cache_size=0`,
   익명 statement 이름). 풀은 `AsyncAdaptedQueuePool`(`pool_size=5`, `max_overflow=5`,
   `pool_pre_ping=True`, `pool_recycle=300`) — 요청마다 붙던 TCP/TLS 핸드셰이크를 없애되,
   PgBouncer가 끊는 유휴 커넥션은 `pool_pre_ping`이 걸러낸다. 세 백엔드가 동일하다.
   (skill-service의 대화·생성이 쓰는 LangGraph 체크포인터는 이 엔진과 별개로 psycopg 풀을
   따로 둔다.)

### 공통 스택

| 영역 | 기술 |
|---|---|
| 언어/런타임 | Python 3.11 (slim 도커 이미지) |
| 웹 프레임워크 | FastAPI 0.115 + Uvicorn |
| ORM / 드라이버 | SQLAlchemy 2.0 (async) + asyncpg |
| 설정 | `pydantic-settings` (`.env` → `Settings`) |
| DB | Supabase PostgreSQL (물리 1개) |
| 배포 | Render (`env: docker`, 무료 플랜) — [tech-decisions.md](../tech-decisions.md) 9절 |
