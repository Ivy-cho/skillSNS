# user-service — 기술 설계

- **포트**: 8001
- **책임**: 소셜 로그인(OAuth) 처리, 자체 JWT(access/refresh) 발급·갱신, 프로필·아바타 관리
- **소유 테이블**: `users`, `refresh_tokens`
- **API 계약(요청/응답 전문)**: [`../specs/user-service-login.md`](../specs/user-service-login.md)

---

## 1. SW 구조

```
user-service/
├── main.py                     # FastAPI 앱, lifespan(테이블/버킷 준비), CORS, 라우터 등록, /health
├── run.py                      # (없음 — skill-service만 있음)
├── requirements.txt
├── Dockerfile                  # python:3.11-slim, uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
└── app/
    ├── core/
    │   ├── config.py           # Settings (pydantic-settings): Supabase 키, DATABASE_URL, JWT_*, CALLBACK_URL, CORS_ORIGINS
    │   └── security.py         # create_access_token / create_refresh_token / decode_token (python-jose, HS256)
    ├── db/
    │   └── database.py         # async engine(작은 커넥션 풀 + PgBouncer 호환) + async_sessionmaker + get_db + Base
    ├── models/
    │   └── user.py             # User, RefreshToken (SQLAlchemy 2.0 Mapped 스타일)
    ├── schemas/
    │   └── auth.py             # 요청/응답 Pydantic 모델
    └── api/routes/
        └── auth.py             # 모든 엔드포인트(prefix=/auth) + Supabase 클라이언트 2종 + 아바타 파이프라인
```

### 레이어링

`routes/auth.py` 한 파일에 라우팅·비즈니스 로직이 같이 있다(서비스 규모가 작아
service 레이어를 따로 두지 않음). 계층은 사실상 **config → db/security(인프라) →
models/schemas(데이터) → routes(핸들러)** 4단이다.

### 요청 처리 흐름 (인증이 필요한 요청)

```
요청 (Authorization: Bearer <access>)
  → HTTPBearer 로 토큰 추출
  → get_current_user 의존성:
      decode_token()  ── 서명·만료 검증 (python-jose, JWT_SECRET_KEY)
      payload.type == "access" 확인
      SELECT users WHERE id = payload.sub
  → 핸들러 실행 → Pydantic 응답 모델로 직렬화
```

### 외부 의존성

| 대상 | 용도 | 사용하는 키 |
|---|---|---|
| Supabase Auth | `sign_in_with_oauth`(로그인 URL 생성), `exchange_code_for_session`(code→세션) | `SUPABASE_ANON_KEY` |
| Supabase Storage | 아바타 파일 업로드(`avatars` 버킷), public URL 발급 | `SUPABASE_SERVICE_KEY` (RLS 우회 — 우리 JWT로 이미 인증했으므로 서버가 대신 업로드) |
| Supabase Postgres | `users` / `refresh_tokens` 읽기·쓰기 | `DATABASE_URL` (asyncpg) |

`main.py` lifespan에서 `avatars` 버킷을 `create_bucket`(public, 5MB 제한)으로 매 기동 시
확인한다 — 이미 있으면 `StorageException`을 삼킨다(수동 셋업 스텝을 없애기 위한 선택).

---

## 2. DB 설계

두 테이블 모두 user-service 소유. `refresh_tokens.user_id → users.id`에만 실제 FK가 있다.

### `users`

| 컬럼 | 타입 | 제약 / 비고 |
|---|---|---|
| `id` | String (UUID) | PK, 앱에서 `uuid4()` 생성 |
| `email` | String | `UNIQUE`, NOT NULL. 이메일이 없는 계정은 `{provider_id}@{provider}.skillsns` placeholder 저장 |
| `nickname` | String | NOT NULL. OAuth 메타데이터에서 추출(Google=`full_name`, Kakao=`name`/`preferred_username`), 없으면 이메일 로컬파트 |
| `provider` | String | NOT NULL. `google` / `kakao` |
| `provider_id` | String | NOT NULL. OAuth 제공자의 사용자 id(Supabase user id) |
| `bio` | Text | NULL 허용. lifespan `ALTER TABLE ADD COLUMN IF NOT EXISTS`로 추가된 컬럼 |
| `avatar_url` | Text | NULL 허용. 가입 시 소셜 프로필 사진 URL을 기본값으로, 이후 업로드 시 우리 Storage URL로 교체. 역시 `ALTER TABLE`로 추가 |
| `created_at` / `updated_at` | DateTime(tz) | `updated_at`은 `onupdate`로 자동 갱신 |

- **계정 식별 키는 `(provider, provider_id)`** — 이메일이 아니다. 콜백에서
  `SELECT ... WHERE provider_id = ? AND provider = ?`로 기존 유저를 찾는다.
  같은 사람이 Google과 Kakao로 각각 로그인하면 **완전히 별개 계정**이 된다(의도된 설계).
- `email`에 `UNIQUE`가 걸려 있으나 실제 식별에는 안 쓴다. 실제 이메일이 새로 들어오면
  placeholder(`.skillsns`로 끝나는 값)를 덮어쓴다.

### `refresh_tokens`

| 컬럼 | 타입 | 제약 / 비고 |
|---|---|---|
| `id` | String (UUID) | PK |
| `user_id` | String | `FOREIGN KEY → users.id`, NOT NULL |
| `token` | Text | NOT NULL. refresh JWT 원문 |
| `expires_at` | DateTime(tz) | NOT NULL |
| `created_at` | DateTime(tz) | |

- **1인 1토큰** — 콜백에서 새 refresh token을 만들기 전에
  `DELETE FROM refresh_tokens WHERE user_id = ?`로 기존 것을 지운다.
  로그아웃도 `DELETE ... WHERE user_id = ?`.
- `POST /auth/refresh`는 (1) refresh JWT 서명·`type` 검증 → (2) DB에 그 토큰 행이
  있는지 → (3) `expires_at` 미도래인지, 3중으로 확인한 뒤 새 access token만 발급한다
  (refresh token 자체는 재발급하지 않는다 — 슬라이딩 만료 없음).

### 마이그레이션

Alembic 없음. `main.py` lifespan:
```python
await conn.run_sync(Base.metadata.create_all)           # 없는 테이블만 생성
await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT"))
await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT"))
```

---

## 3. 핵심 기술 설계 결정

### 3.1 OAuth는 Supabase Auth에 위임, 세션 토큰은 자체 발급

로그인 흐름:
```
프론트 → GET /auth/login/{provider}        → Supabase sign_in_with_oauth → login_url 반환
프론트가 login_url로 이동 → 제공자 로그인 → CALLBACK_URL(프론트의 /auth/callback)로 ?code= 리다이렉트
프론트 → GET /auth/callback?code=...        → Supabase exchange_code_for_session
                                            → users upsert (provider_id 기준)
                                            → 자체 access/refresh JWT 발급 + refresh_tokens 저장
```

- **`CALLBACK_URL`은 프론트엔드의 콜백 페이지**를 가리킨다(user-service 자신이 아니라).
  프론트가 `code`를 받아 다시 user-service `/auth/callback`으로 넘긴다.
- Supabase는 로그인 URL 발급과 code 교환에만 쓰고, 이후 인증은 **우리 JWT**로만 한다.
  skill-service가 검증할 수 있도록 `JWT_SECRET_KEY`를 두 서비스가 공유한다.
- 토큰 수명: access 60분(`ACCESS_TOKEN_EXPIRE_MINUTES`), refresh 7일
  (`REFRESH_TOKEN_EXPIRE_DAYS`). payload: `sub`(user id), `email`, `type`, `exp`.

### 3.2 아바타 업로드 파이프라인 (`POST /auth/me/avatar`)

원본을 그대로 저장하지 않고 항상 정규화한다:

```
업로드 파일
  → content-type 화이트리스트 검사 (jpeg/png/webp/gif)
  → 5MB 크기 제한
  → Pillow로 열기 (실패 시 400)
  → RGBA/LA/P 모드면 흰 배경에 합성 → RGB
  → thumbnail((512, 512))  (확대 안 함, 축소만)
  → JPEG 재인코딩 (quality=85)
  → Supabase Storage 'avatars' 버킷에 {user.id}.jpg 로 upsert (service-role 키)
  → public URL 반환
```

포맷을 JPEG로 통일하기 때문에 **유저당 파일 경로가 항상 `{id}.jpg` 하나**로 고정되고,
재업로드는 같은 경로 덮어쓰기가 된다(고아 파일이 안 쌓임).
DB의 `users.avatar_url` 갱신은 이 응답을 받은 프론트가 `PATCH /auth/me`로 반영한다.

### 3.3 프로필 수정은 부분 업데이트

`PATCH /auth/me`는 `ProfilePatch`(`nickname`/`bio`/`avatar_url`, 전부 optional)에서
`model_dump(exclude_unset=True)`로 온 필드만 `setattr`한다. `nickname` 1–20자,
`bio` 0–80자 제약은 Pydantic이 건다.

---

## 4. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | ✅ | OAuth 흐름용 |
| `SUPABASE_SERVICE_KEY` | ✅ | Storage 업로드(RLS 우회)용 |
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://...` (skill/feed와 동일 인스턴스) |
| `JWT_SECRET_KEY` | ✅ | HS256 서명 키. **skill-service와 반드시 동일** |
| `JWT_ALGORITHM` | | 기본 `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | 기본 `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | | 기본 `7` |
| `CALLBACK_URL` | | 기본 `http://localhost:3000/auth/callback`. **프론트**의 콜백 주소. Supabase Auth의 Redirect URL에도 등록 필요 |
| `CORS_ORIGINS` | | 쉼표 구분 오리진 목록. 기본 `http://localhost:3000` |

---

## 5. 배포

Render `env: docker`, `Dockerfile`로 이미지 빌드 → `uvicorn main:app --host 0.0.0.0 --port ${PORT}`.
`branch: develop`, `autoDeploy: false`(GitHub Actions가 Deploy Hook 호출).
전체 파이프라인은 [`../tech-decisions.md`](../tech-decisions.md) 9절 참고.
