# 기술 스택 의사결정 문서

## 프로젝트 개요
- **프로젝트명**: skillSNS
- **목적**: Agent/Prompt 오케스트레이션을 활용한 Skill SNS MSA 서비스 (토이 프로젝트)
- **운영 환경**: 로컬 Windows → Docker → 클라우드 배포

---

## 1. 아키텍처

### 결정: MSA (Microservices Architecture)
- 각 서비스는 독립 디렉토리 + 독립 Docker 컨테이너로 구성
- 서비스 간 통신은 HTTP API

### 서비스 구성
| 서비스 | 포트 | 역할 |
|---|---|---|
| user-service | 8001 | 사용자 인증 / 프로필 관리 |
| skill-service | 8002 | 스킬 등록 / 검색 / 추천 |
| feed-service | 8003 | 피드 생성 / 소셜 인터랙션 |

---

## 2. 언어 및 프레임워크

### 결정: Python + FastAPI
| 후보 | 검토 내용 |
|---|---|
| FastAPI | 비동기(async) 지원 → Agent 호출 대기에 유리, 자동 Swagger 문서, 빠른 성능 ✅ 채택 |
| Flask | 단순하지만 비동기 지원 약함 |
| Django | 무겁고 MSA에 과도함 |

---

## 3. 데이터베이스

### 결정: Supabase (PostgreSQL)

#### 검토한 후보
| 후보 | 검토 내용 |
|---|---|
| PostgreSQL (Docker 로컬) | 직접 관리 필요, 로컬에서만 사용 가능 |
| SQLite | 개발용으로만 적합, 프로덕션 부적합 |
| MySQL | PostgreSQL 대비 생태계 좁음 |
| **Supabase** | PostgreSQL을 클라우드에서 호스팅, 무료 티어 제공 ✅ 채택 |

#### Supabase 채택 이유
- 내부 엔진이 **PostgreSQL 14+** → 기존 SQL/SQLAlchemy 그대로 사용 가능
- 무료 티어: 500MB DB, 토이 프로젝트에 충분
- 내장 Auth, 대시보드 UI 제공
- 클라우드 직접 연결 → Docker에 DB 컨테이너 불필요
- Realtime 기능 → 피드 서비스에 활용 가능

#### 로컬 개발 방식
- Supabase 클라우드에 바로 연결 (오프라인 개발 불필요 판단)
- 각 서비스에서 환경변수로 Supabase DB URL 주입

---

## 4. 배포 서비스

### 결정: Render

#### 검토한 후보
| 후보 | 검토 내용 |
|---|---|
| Render | 무료 웹서비스, Docker 지원, MSA 독립 배포 가능 ✅ 채택 |
| Fly.io | Docker 친화적, 슬립 없음, CLI 기반으로 다소 복잡 |
| Railway | docker-compose 지원, 월 $5 크레딧 한도 있음 |
| Google Cloud Run | 무료 티어 넉넉하나 GCP 설정 복잡 |
| Vercel | 프론트엔드/서버리스 전용 → FastAPI MSA 구조에 부적합 ❌ 제외 |

#### Render 채택 이유
- 무료 티어에서 웹서비스 여러 개 독립 배포 가능 → MSA 구조에 적합
- GitHub 연동 시 자동 CI/CD
- Dockerfile 그대로 사용 가능
- UI가 직관적 → 초기 배포 진입장벽 낮음
- 단점: 15분 비활성 시 슬립 (토이 프로젝트 수준에서 허용)

---

## 5. 인증 방식

### 결정: Supabase Auth (소셜 로그인)

#### 소셜 로그인 제공자
- Google / Kakao

#### 검토한 방식
| 방식 | 검토 내용 |
|---|---|
| 직접 구현 | OAuth 플로우 / JWT 완전 커스터마이징 가능, 학습에 유리, 구현량 많고 보안 실수 위험 |
| **Supabase Auth** | OAuth 처리 자동화, 구현량 대폭 감소, 보안 검증됨 ✅ 채택 |

#### 채택 이유
- 토이 프로젝트 특성상 빠른 구현 우선
- Supabase Auth가 Google / Kakao OAuth 플로우 자동 처리
- 향후 서비스 확장 시 직접 구현으로 전환 예정

#### 토큰 전략
| 토큰 | 수명 |
|---|---|
| Access Token | 1시간 |
| Refresh Token | 7일 |

---

## 6. 확정 스택 요약

| 항목 | 기술 | 비고 |
|---|---|---|
| 언어 | Python 3.11 | |
| 프레임워크 | FastAPI | 비동기, Swagger 자동 생성 |
| DB | Supabase (PostgreSQL) | 무료 클라우드 호스팅 |
| ORM | SQLAlchemy | psycopg2 드라이버 |
| 인증 | Supabase Auth + JWT | 소셜 로그인 (Google / Kakao) |
| 컨테이너 | Docker + docker-compose | 로컬 개발용 |
| 배포 | Render (백엔드 3개 + 프론트) | GitHub Actions → Deploy Hook 자동 배포 |
| CI/CD | GitHub Actions | lint 통과 시에만 Render Deploy Hook 호출 (develop 브랜치) |
| LLM | Anthropic Claude, BYOK | 사용자 본인 API 키를 Fernet으로 암호화해 서버에 저장 (아래 8절) |

---

## 6. 비용

| 항목 | 비용 |
|---|---|
| Supabase | 무료 |
| Render | 무료 |
| Docker | 무료 |
| LLM API | **유료** (별도 결정) |
| 기타 | 무료 |

---

## 7. AI 스킬 생성 엔진

### 결정: Anthropic 공식 Agent Skills를 직접 연동하지 않고, 기존 스택(`langchain-anthropic`/`langgraph`)으로 자체 구현

#### 검토한 후보
| 후보 | 검토 내용 |
|---|---|
| Anthropic Agent Skills API 직접 연동 (`/v1/skills` + code execution tool) | `skill-creator` 스킬을 code execution VM에서 실행해 실제 SKILL.md를 생성하는 것이 기술적으로 가능. 하지만 VM 샌드박스, `/v1/skills` 업로드, SKILL.md 번들 포맷(progressive disclosure, scripts/references)이 전부 필요함. 이 프로젝트는 "Claude 자신에게 새 도구를 장착"하는 게 아니라 "채팅 페르소나 시스템 프롬프트 문서 하나"만 필요해서 목적이 불일치하고 인프라만 무거워짐 ❌ 제외 |
| 직접 구현 (langgraph 커스텀 그래프) | 기존에 쓰던 스택을 그대로 재사용 ✅ 채택 |

#### 구현 방식의 변화

처음엔 skill-creator의 핵심 절차(인터뷰 → 초안 → 자체 테스트 → assertion 기반 채점 → 재작성)만 가볍게 이식한 단일 그래프(`interview → self_test → critique` 순환, 내부 평가는 API에 노출 안 함)로 구현했었다. 이후 `skillsns-main` 프론트엔드의 `workflows/*.md`(what-skill → skill-content → skill-name → skill-test → skill-improve, 5단계) 설계로 교체했다 — 자세한 구조는 `docs/specs/skill-service.md` 4-1절과 `skill-service/app/agent/creator/` 참고.

#### 채택 이유 (Anthropic Agent Skills API를 안 쓴 이유는 여전히 유효)
- 실제 skill-creator의 신뢰성은 특별한 모델/기술이 아니라 "테스트를 먼저 돌려보고 객관적 기준으로 채점한 뒤 고친다"는 절차에서 나온다는 판단은 그대로 유지된다. 다만 그 절차를 사용자에게 숨긴 내부 처리로 둘지, 아니면 사용자가 직접 보고 판단하는 단계(현재의 skill-test/skill-improve)로 노출할지가 바뀌었다.

---

## 8. LLM 비용 — BYOK(Bring Your Own Key)

### 결정: 서버가 공용 API 키를 들고 있지 않고, 유저마다 본인 Anthropic 키를 등록해서 쓴다

#### 배경
토이 프로젝트를 여러 명이 같이 써보는 상황에서, 서버 공용 키 하나로 LLM 비용을 다 감당하면
누가 얼마나 썼는지 통제가 안 되고 비용이 특정 한 명에게 쏠린다. "대화하는 사람이 자기
키로 비용을 낸다"는 원칙으로, 사용자별로 각자의 키를 등록해서 쓰게 했다.

#### 구현
- `skill-service`의 `user_secrets` 테이블에 `anthropic_api_key_encrypted` 컬럼 하나
- 저장 시 `cryptography`(Fernet) 대칭키로 암호화, 서버 환경변수 `SECRET_ENCRYPTION_KEY`로
  복호화 — 평문은 DB에도 로그에도 남지 않는다
- 계정(user_id) 단위로 저장되어 어느 기기·브라우저에서 로그인해도 다시 입력할 필요가 없다
- 채팅(`/chat/*`)·스킬 생성(`/skills/create/*`) 모두 호출 직전에 로그인 유저 본인 키를
  조회해서 씀. 키가 없으면 LLM을 호출하지 않고 등록 안내 메시지/에러를 즉시 반환한다 —
  서버 공용 키로 조용히 폴백하지 않는다.
- 예외로, 본인 키가 없는 사람도 **계정당 평생 3회**(`FREE_TRIAL_LIMIT`, 생성·대화 합산)는
  서버 기본 키로 무료 체험할 수 있다. 처음부터 자기 키를 넣으라고 하면 아예 안 써보고
  이탈하는 경우가 많아 만든 트라이얼. 채팅창을 막 연 "오프닝 턴"은 이 카운트를 소모하지
  않는다(항상 서버 기본 키).

---

## 9. 배포 & CI/CD 파이프라인

### 9.1 결정 요약

| 항목 | 선택 | 이유 |
|---|---|---|
| 배포 플랫폼 | **Render** (4개 서비스 전부) | 무료 티어에서 웹서비스 여러 개 독립 배포 → MSA에 적합. Dockerfile 그대로 사용 |
| 빌드 방식 | `env: docker` — 각 서비스 디렉토리의 `Dockerfile`로 이미지 빌드 후 컨테이너 실행 | Render 네이티브 빌드팩이 아니라 우리가 관리하는 Dockerfile을 그대로 씀(로컬 docker-compose와 동일 이미지) |
| 서비스 정의 | `render.yaml` Blueprint (New → Blueprint) | 4개 서비스(user/skill/feed-service + frontend)를 한 파일로 선언 |
| 배포 트리거 | `autoDeploy: false` + **GitHub Actions가 Deploy Hook 호출** | Render 자체 auto-deploy 대신, lint를 통과했을 때만 배포되게 하려고 |
| CI | GitHub Actions — `ruff`(백엔드) + `tsc`/`eslint`(프론트) | 배포 전 정적 검사 |
| DB | 별도 배포 없음 — Supabase 클라우드에 직접 연결 | 4절/3절 |

### 9.2 `render.yaml` (Blueprint)

- 서비스 4개 모두 `type: web`, `env: docker`, `region: singapore`, `plan: free`,
  `branch: develop`, `autoDeploy: false`.
- `healthCheckPath`: 백엔드는 `/health`, 프론트는 `/`.
- 환경변수 두 종류:
  - `value:`가 박힌 것 — `CORS_ORIGINS`(양쪽 배포 도메인), 프론트의 `NEXT_PUBLIC_*`
    (백엔드 서비스들의 `.onrender.com` URL), `JWT_ALGORITHM`, 토큰 수명, `ANTHROPIC_MODEL`.
    서비스 이름을 `render.yaml` 그대로 뒀다면 손댈 필요 없음.
  - `sync: false` — `SUPABASE_*`, `DATABASE_URL`, `JWT_SECRET_KEY`, `ANTHROPIC_API_KEY`,
    `SECRET_ENCRYPTION_KEY`, `CALLBACK_URL`. Render 대시보드에서 직접 입력(비밀값).
- **`region: singapore`**: Render 기본 리전(미국)과 Supabase DB 리전(서울)이 멀어
  요청마다 리전 간 왕복이 생기던 것을 완화 — 서울에 가장 가까운 Render 리전으로 지정.

### 9.3 GitHub Actions — 워크플로 2개

| 파일 | 트리거 | 하는 일 |
|---|---|---|
| `.github/workflows/deploy.yml` | `push` → `develop` | ① `lint-backend`(ruff, user/skill/feed 한꺼번에) ② `lint-frontend`(`npm ci` → `tsc --noEmit` → `eslint src`) ③ 둘 다 통과 시 `deploy` 잡이 Deploy Hook 4개를 `curl -f`로 순차 호출 |
| `.github/workflows/ci.yml` | `push` → `backend`/`frontend`/`main`, 또는 `backend`/`develop`/`frontend`/`main`으로의 `pull_request` | deploy.yml과 **같은 lint만** 돌리고 배포는 안 함. 머지 전에 문제를 미리 잡는 용도. (`develop` 직접 push는 deploy.yml이 이미 같은 검사를 하므로 ci.yml의 push 트리거에서 제외 — 중복 실행 방지) |

- **lint 버전 고정**: `pip install ruff==0.15.22`. 버전을 안 박았을 때 실행 시점마다
  다른 ruff가 깔리며 기본 규칙셋이 달라져 CI가 들쭉날쭉 실패한 이력이 있다(README 11.6절).
- **`deploy` 잡의 Deploy Hook URL**은 GitHub Secrets에 저장:
  `RENDER_DEPLOY_HOOK_USER_SERVICE` / `_SKILL_SERVICE` / `_FEED_SERVICE` / `_FRONTEND`.

### 9.4 배포 흐름

```
git push origin develop
  └─ GitHub Actions: deploy.yml
       ├─ lint-backend   (ruff user-service/ skill-service/ feed-service/)  ─┐
       ├─ lint-frontend  (tsc --noEmit + eslint src)                        ─┴ 하나라도 실패 → 배포 중단
       └─ deploy: needs [lint-backend, lint-frontend]
            curl -f $RENDER_DEPLOY_HOOK_USER_SERVICE
            curl -f $RENDER_DEPLOY_HOOK_SKILL_SERVICE
            curl -f $RENDER_DEPLOY_HOOK_FEED_SERVICE
            curl -f $RENDER_DEPLOY_HOOK_FRONTEND
          → 각 Render 서비스가 자기 Dockerfile로 빌드·기동

git push origin backend | frontend | main   (또는 이 브랜치들로의 PR)
  └─ GitHub Actions: ci.yml  — 같은 lint만, 배포 없음
```

브랜치 전략: `backend`/`frontend`에서 작업 → `develop`에 통합(= 배포) →
`main`은 프론트(Vercel 병행 배포용) 및 안정 스냅샷.

### 9.5 배포 환경 특성 / 알려진 함정

- **콜드 스타트**: Render 무료 플랜은 15분 이상 요청이 없으면 슬립. 첫 요청에 30–50초
  (4개 서비스 각각). 포트폴리오 용도로는 허용.
- **Next standalone 502**: 프론트 Dockerfile runner에 `ENV HOSTNAME="0.0.0.0"`가 없으면
  Render 프록시 네트워킹에서 502. (README 11.1절)
- **서비스 이름/서브도메인 재사용**: 삭제한 서비스 이름을 Render가 바로 안 풀어줘서
  재생성 시 임의 접미사가 붙을 수 있다. `render.yaml`의 `name`/`region` 등 정체성
  필드는 이미 존재하는 서비스에 대해 건드리지 않고, 배포는 Deploy Hook에만 의존한다.
  (README 11.2절)
- **`sync: false` 값 재입력 누락**: Blueprint를 재적용하면 비밀 환경변수는 안 옮겨지므로
  전부 다시 넣어야 한다(feed-service가 `DATABASE_URL` 누락으로 기동 실패한 이력 — README 11.7절).
- **환경변수에 개행 혼입**: `.env`에서 값을 복사할 때 줄바꿈까지 딸려 들어가
  `database "postgres\n" does not exist`로 죽은 이력(README 11.5절). 값 끝 공백/개행 제거.
- **응답 지연**: 위 `region: singapore`로 리전 간 왕복은 완화. SQLAlchemy가 `NullPool`
  이라 요청마다 커넥션을 새로 맺는 비용은 남아 있다 — 커넥션 풀링 전환이 다음 개선 후보
  (README 11.3절).

### 9.6 배포 URL

| 서비스 | URL |
|---|---|
| frontend | <https://skillsns-frontend.onrender.com> |
| user-service | <https://skillsns-user-service.onrender.com> (`/docs`) |
| skill-service | <https://skillsns-skill-service.onrender.com> (`/docs`) |
| feed-service | <https://skillsns-feed-service.onrender.com> (`/docs`) |

> 프론트를 Vercel로 병행 배포하는 경우: `render.yaml`에서 `skillsns-frontend`만 빼고
> 백엔드 3개는 그대로. Vercel은 Dockerfile 대신 Next를 직접 빌드하고 `main` push 시
> 자동 배포한다. 백엔드 `CORS_ORIGINS`에 Vercel 도메인이 이미 포함돼 있다.
