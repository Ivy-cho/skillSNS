# skillSNS

**개인이 가진 기술(노하우)을 나누고, 다른 사람의 기술을 이용할 수 있는 서비스**를
기획하고 MSA 구조로 직접 구현했다. 사용자는 자신의 전문성을 AI 챗봇 형태의 "스킬"로
만들어 공유하고, 다른 사람이 만든 스킬과 대화하며 그 기술을 실제로 이용할 수 있다.

- 상태: 🚧 개발 진행중 — 핵심 기능(로그인, 스킬 생성 파이프라인, 대화, 피드, 스크랩,
  채팅 목록, BYOK)은 실 DB와 붙어 Render에 배포되어 동작하고, 프론트 연동까지 끝났다.
  진행 중인 요청은 [`frontend/FRONTEND_HANDOFF.md`](frontend/FRONTEND_HANDOFF.md)/
  [`frontend/BACKEND_HANDOFF.md`](frontend/BACKEND_HANDOFF.md)에 정리 중.
- **바로 써보기: https://skillsns-frontend.onrender.com** — 카카오/구글로 로그인하면
  스킬을 만들고 대화까지 해볼 수 있다. 대화·생성은 본인 Anthropic 키가 필요하지만,
  키가 없어도 계정당 3회는 무료로 돌아간다. (Render 무료 플랜이라 15분 이상 유휴 상태면
  첫 접속에 30~50초 콜드 스타트가 있다.)
- 리포지토리: [Ivy-cho/skillSNS](https://github.com/Ivy-cho/skillSNS)

---

## 팀 / 참여자

세 명이 함께 기획부터 배포까지 진행했다. 각자 역할은 나눠져 있었지만 셋 다 Claude Code로
개발했기 때문에, `design.md`·`*_HANDOFF.md`·`docs/specs/` 같은 마크다운 문서로 서로의
작업 영역을 최대한 갈라 충돌을 줄였고, 진행 상황과 시행착오를 문서로 계속 남기며
개발했다 (이 README의 "구현 완료 요약"과 "트러블슈팅 기록"이 그 산물이다). 세 명 모두
직접 테스터로도 참여해 로그인부터 스킬 생성·대화·피드까지 반복해서 돌려봤다.

| 이름 | 역할 | GitHub |
|---|---|---|
| 윤에스더 | 총괄 기획 · 프롬프트 엔지니어링 · 테스트. 후반에 카테고리 택소노미로 기획을 바꾸면서 해당 백엔드까지 구현 | [@esthers2](https://github.com/esthers2) |
| 최여림 | 기획 · 디자인 · 프론트엔드 · 테스트 | [@yeorimudaaa](https://github.com/yeorimudaaa) |
| 조은비 | 백엔드 · 배포 · 테스트 | [@Ivy-cho](https://github.com/Ivy-cho) |

---

## 기능 설명

사용자가 앱에서 실제로 하는 일들이다. (기술적인 동작 방식은 아래
[2. 무엇을 만들었나](#2-무엇을-만들었나)부터.)

- **내 노하우를 AI 스킬로 만들기** — 잘 아는 분야에 대해 AI가 던지는 질문에
  답하다 보면, 그 노하우가 담긴 나만의 AI 챗봇("스킬")이 완성된다. 참고할 글 링크나
  파일도 넣을 수 있다. AI가 알아서 만든 스킬을 테스트해보고 부족한 부분을 다듬어주며,
  카테고리도 자동으로 붙는다. 중간에 마음에 안 들면 이전 단계로 되돌릴 수 있다.
- **다른 사람의 스킬과 대화하기** — 남이 만들어 공개한 스킬을 골라 대화하면, 그 사람의
  노하우를 바로 빌려 쓸 수 있다("면접 코치", "이직 자소서 첨삭러"처럼). 대화를 열면
  스킬이 먼저 자기소개하고 질문을 건네고, 나갔다 다시 들어와도 대화가 이어진다.
- **피드에서 스킬 둘러보기** — 공개된 스킬을 검색하고, 정렬을 바꾸거나 카테고리별로
  묶어 보면서 훑는다. "요즘 뜨는 스킬"로 인기 있는 걸 바로 확인할 수 있다.
- **스크랩** — 관심 가는 스킬을 폴더로 정리해 모아둔다.
- **채팅 목록** — 대화해본 스킬을 최근 순으로 모아 보고, 눌러서 이어 대화한다.
- **로그인 & 프로필** — 카카오/구글로 로그인하고, 닉네임·소개글·프로필 사진을 편집한다.
- **내 키로 이용 (BYOK)** — 대화·생성에 드는 AI 비용은 각자 본인 Anthropic 키로 낸다.
  키가 없어도 계정당 3회까지 무료로 체험해볼 수 있다.

---

## 구현 완료 요약

### Phase 1 — 백엔드 초기 구현 (2026.06.25 ~ 06.29)
- [x] user-service: 소셜 로그인(Google/Kakao) + JWT(Access/Refresh) 발급
- [x] skill-service: 스킬 CRUD + LangGraph 기반 AI 에이전트 대화
- [x] OAuth 사용자 식별을 `provider_id` 기준으로 정정, 카카오 전화번호 전용 계정 대응

### Phase 2 — 스킬 생성 파이프라인 + 배포 기반 (2026.07.18 ~ 07.20)
- [x] Render + GitHub Actions 배포 설정 최초 구성
- [x] 5단계 스킬 생성 파이프라인(`/skills/create/*`, LangGraph) 구현
- [x] 프론트엔드(Next.js)를 같은 저장소로 편입 + 실제 skill-service 백엔드에 연결
- [x] Docker Compose로 로컬 통합 실행 구성

### Phase 3 — 프론트 UX 다듬기 (2026.07.22 ~ 08.11)
- [x] 피드, 채팅 목록, 스크랩+폴더, 프로필 편집, 하단 네비 화면 추가
- [x] 스킬 생성 대화 UX를 스텝형 페이지로 개편, 로그인 가드 정리

### Phase 4 — 실 데이터 연동 (2026.08.17 ~ 08.18)
- [x] feed-service 신설 (skills/users/scraps 읽기 전용 조인)
- [x] 스크랩+폴더, 프로필 편집(닉네임/소개글/사진) 백엔드 구현
- [x] `DEV_TOKEN` 우회 코드 전체 제거 — 로그인·API 인증을 실제 플로우로 전환
- [x] 소셜 로그인 CORS/CALLBACK_URL 정식 배선, 미사용 provider(네이버) 정리

### Phase 5 — 프로덕션 배포 + BYOK (2026.08.20 ~ 08.21)
- [x] 4개 서비스(백엔드 3 + 프론트) 전부 Render Docker 배포로 전환, CORS 환경변수화
- [x] CI/CD를 lint 전용(`ci.yml`)과 lint+deploy(`deploy.yml`, develop 브랜치)로 분리
- [x] BYOK(사용자 본인 Anthropic 키) 구현 — Fernet 암호화 저장, 계정 단위로 기기 무관 유지
- [x] 프로필 사진 업로드 시 리사이즈(512px)·JPEG 통일, 소셜 프로필 사진 가입 시 기본값 적용
- [x] 스킬 피드 서버 사이드 검색(`ILIKE`) + 페이징(`limit`/`offset`)
- [x] 채팅 이전 대화 이어보기 API(`GET /chat/{skill_id}/latest`)
- [x] `test_frontend` 정적 페이지 제거, 문서 전체를 실제 코드 기준으로 정합성 점검

### Phase 6 — 프론트 연동 완료 (2026.08.23)
- [x] 피드 검색·페이징 프론트 연동 (300ms 디바운스 + 무한 스크롤)
- [x] 채팅 이어보기 프론트 연동 (지난 대화 복원 + 인사말 유지)
- [x] 마이페이지 프로필 사진·소개글 실제 값 반영
- [x] 피드 응답에 작성자 프로필 사진 URL 추가

### Phase 7 — 카테고리 자동 분류 + 대화 UX (2026.08.27 ~ 08.31)
- [x] `categories` 정규화 테이블 도입 — 대분류/소분류를 한 테이블에 담는 자기참조 트리
      (`parent_id`가 NULL이면 대분류). 이름 중복은 부분 유니크 인덱스로 막음
- [x] 카테고리명 Agent — 사용자가 카테고리를 직접 고르는 단계를 없애고, 이름 확정 시점에
      스킬 내용만 보고 대/소분류를 자동 분류 (재사용 우선 upsert, 실패해도 "미분류"로 저장)
- [x] 홈 목록·피드 트렌딩·스킬 대화·스크랩·채팅 목록 카드에 카테고리 이모지 + 소분류 이름 표시
- [x] 피드 정렬 옵션 + 카테고리별 묶어 보기
- [x] 스킬 대화 진입 시 스킬이 스스로 소개하고 첫 질문을 던지는 오프닝 턴
      (`POST /chat/{skill_id}`에서 `message` 생략 허용)
- [x] 둘러보기에서 스킬을 누르면 새 대화로 열기, 채팅 목록 미리보기의 마크다운 기호 제거

### Phase 8 — 백엔드 핸드오프 정리 (2026.09.02)
- [x] `GET /feed`에 `?sort=recent|views|scraps` + `?category=`(정확일치 필터) + 응답에
      `major_category`(대분류 이름) 추가 — 프론트 전체 페이지 재정렬을 서버 정렬로 대체
- [x] `GET /categories` — 카테고리 택소노미 목록(`skill_count` 포함, 공개), 칩 필터용
- [x] 오프닝 턴 자리표시자(`(대화 시작)`)를 대화 이력 응답에서 서버가 제외
      (`chat_sessions.started_with_opening`), 오프닝만 있는 빈 세션은 채팅 목록에서 감춤
- [x] 스킬 테스트 리포트 완전성 보장 — 채점 결과 검증 후 재요청, 그래도 빠지면 실측치로 메움
- [x] SQLAlchemy 엔진을 `NullPool` → 커넥션 풀(`AsyncAdaptedQueuePool`, `pool_pre_ping`
      + `pool_recycle=300`)로 전환 — 요청마다 붙던 TCP/TLS 핸드셰이크 제거 (11.3절 ②)

### 진행 중 / 다음
- [ ] 계정 provider(구글/카카오) 간 통합 — 필요성 판단 후 보류 중

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | skillSNS |
| 상태 | 🚧 개발 진행중 (핵심 기능 + 프론트 연동 완료, 세부 개선 중) |
| 목적 | Agent/Prompt 오케스트레이션을 활용한 Skill SNS 서비스 (포트폴리오용 토이 프로젝트) |
| 아키텍처 | MSA — 독립 배포되는 백엔드 3개(user/skill/feed-service) + Next.js 프론트엔드 1개 |
| 리포지토리 | [Ivy-cho/skillSNS](https://github.com/Ivy-cho/skillSNS) |
| 브랜치 전략 | `backend`(백엔드 작업) / `frontend`(프론트 작업) / `develop`(통합, Render 배포 트리거) / `main`(프론트 배포 트리거, Vercel) |
| 배포 | 4개 서비스 전부 Render 무료 플랜(Docker) — 프론트: <https://skillsns-frontend.onrender.com> |

기술 선택 배경(왜 FastAPI인지, 왜 Supabase·Render인지, BYOK를 왜 이렇게 설계했는지,
배포·CI/CD 파이프라인 등)은 [`docs/tech-decisions.md`](docs/tech-decisions.md)에 정리돼 있다.

서비스별 **SW 구조 → DB 설계 → 핵심 기술 결정**은
[`docs/architecture/`](docs/architecture/)에 서비스 단위로 나눠 정리했다:
[user-service](docs/architecture/user-service.md) ·
[skill-service](docs/architecture/skill-service.md) ·
[feed-service](docs/architecture/feed-service.md) ·
[frontend](docs/architecture/frontend.md).

---

## 2. 무엇을 만들었나

"면접 코치", "이직 자소서 첨삭러"처럼 스스로 잘 아는 분야를 AI 챗봇으로 빚어 남에게
내어주고, 반대로 남이 빚어낸 챗봇을 가져다 쓰는 순환이 서비스의 핵심이다.

### 2.1 주요 기능

- **AI와 함께 스킬 만들기** — 주제 정하기 → 내용 정하기 → 이름 정하기 → 테스트 →
  개선 → 게시, 5단계 대화형 파이프라인. 사용자가 만든 스킬을 실제로 가동해 스스로
  질문·답변 테스트를 돌리고 객관적 기준으로 채점한 뒤, 부족하면 사용자 모르게
  재작성까지 시도한다(`skill-service/app/agent/creator/`, LangGraph). 이름 확정 시점에
  카테고리명 Agent가 스킬 내용을 보고 대/소분류를 자동으로 붙인다(사용자는 고르지 않는다).
- **스킬과 대화하기** — 게시된 스킬의 시스템 프롬프트로 실제 LLM과 대화. 대화 세션은
  LangGraph의 Postgres 체크포인터에 저장되어 이어서 대화할 수 있다.
- **피드** — 전체 공개 스킬을 최신순으로 보여주고, 제목·소개·작성자·카테고리로
  DB 서버 사이드 검색(`ILIKE`) + `limit`/`offset` 무한 스크롤 페이징. 정렬 옵션과
  카테고리별 묶어 보기를 지원하고, 상단 "요즘 뜨는 스킬"은 조회수 기준(동률이면 이름순) 트렌딩.
- **스크랩 + 폴더** — 마음에 드는 스킬을 폴더별로 정리해서 담아둔다.
- **채팅 목록** — 내가 대화해본 스킬들을 최근 대화순으로 모아보고, 다시 들어가면 이어서
  대화할 수 있다.
- **소셜 로그인 + 프로필** — 카카오/구글 로그인, 닉네임·소개글·프로필 사진 편집.
- **BYOK** — 대화하는 사람이 자기 Anthropic 키로 비용을 낸다. 서버는 공용 키를 들고
  있지 않는다.

### 2.2 아키텍처 (MSA)

MSA로 나뉜 백엔드 3개가 프론트엔드 하나를 함께 지원한다. **API 게이트웨이는 없다** —
프론트가 필요한 서비스에 직접 요청을 보낸다(각 서비스 URL을 `NEXT_PUBLIC_*` 환경변수로
따로 들고 있음). 서비스 간에는 서로를 직접 호출하지 않고, 인증만 공유 비밀
(`JWT_SECRET_KEY`)로 검증한다 — user-service가 발급한 JWT를 skill-service가 그대로
믿고 검증하는 식.

```
                        ┌───────────────────┐
                        │  Next.js frontend │
                        └─────────┬─────────┘
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
   ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  user-service    │  │  skill-service    │  │  feed-service    │
   │  :8001           │  │  :8002            │  │  :8003           │
   │  소셜 로그인      │  │  스킬 CRUD/대화    │  │  skills/users/   │
   │  JWT 발급/검증    │  │  스킬 생성 파이프  │  │  scraps 조인만    │
   │  프로필           │  │  라인, 스크랩, BYOK │  │  (자기 테이블 없음)│
   └────────┬─────────┘  └─────────┬────────┘  └─────────┬────────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                    ▼
                     Supabase Postgres (물리 DB 1개)
```

- **왜 물리 DB가 하나인가**: 서비스별로 스키마(테이블) 소유권은 나누되, 별도 DB
  인스턴스로 쪼개진 않았다. 토이 프로젝트 규모에서 DB 3개를 따로 운영하는 관리 비용이
  MSA의 격리 이점보다 커서 내린 절충이다(`docs/tech-decisions.md`).
- **서비스 간 FK는 없다**: 예를 들어 `skills.user_id`는 물리적으로 `users.id`를
  가리키지만, DB 레벨 `FOREIGN KEY` 제약은 걸려있지 않다 — 서로 다른 서비스가 소유한
  테이블을 애플리케이션 코드로 참조·조인만 한다(자세한 내용은 2.3절).
- **feed-service는 자기 테이블이 없다**: `skills`/`users`/`scraps`를 읽기 전용으로
  조인해서 보여주기만 하는, 3개 중 유일하게 "쓰기"가 없는 서비스다.
- **카테고리는 정규화 테이블이다**: `skills.category`는 자유 텍스트가 아니라 `categories`
  소분류 행의 id를 가리키는 FK다. 대분류/소분류는 `categories` 한 테이블에 자기참조
  (`parent_id`)로 담기고, 표시용 이름·이모지는 feed/skill-service가 조인해 해석한다.
  값을 채우는 건 카테고리명 Agent(2.1절) — 스킬 내용을 보고 자동 분류한다.

| 서비스 | 포트 | 역할 |
|---|---|---|
| user-service | 8001 | 소셜 로그인 / JWT 인증 / 프로필 |
| skill-service | 8002 | 스킬 CRUD / AI 에이전트 대화 / 스킬 생성 파이프라인 / 스크랩 / BYOK |
| feed-service | 8003 | 피드 조회 (skills/users/scraps를 읽기 전용으로 조회, 자체 테이블 없음) |

### 2.3 DB 구조

서비스별 테이블 소유권 기준으로 나열. 화살표(`→`)는 애플리케이션 레벨 참조이고, 실제
DB `FOREIGN KEY` 제약은 **같은 서비스가 소유한 테이블 사이에만** 걸려 있다 — 서비스
경계를 넘는 화살표(예: `skills.user_id → users.id`)는 제약 없이 값만 맞춰서 쓴다.

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│ user-service             │        │ skill-service                  │
│                          │        │                                │
│ users                    │◄───┐   │ skills                         │
│  id (PK)                 │    │   │  id (PK)                       │
│  email, nickname         │    ├───┼─ user_id ─┘  (FK 없음, 값만 참조)│
│  provider, provider_id   │    │   │  title, description, md_content│
│  bio, avatar_url         │    │   │  category (FK→categories.id)   │
│  created_at, updated_at  │    │   │  view_count                    │
│                          │    │   │ chat_sessions                  │
│ refresh_tokens           │    │   │  id (PK)                       │
│  id (PK)                 │    │   │  user_id ─┘                    │
│  user_id (FK→users.id)   │    │   │  skill_id (FK→skills.id)       │
│  token, expires_at       │    │   │  thread_id (LangGraph 연결)     │
└─────────────────────────┘    │   │  updated_at (목록 정렬용)        │
                                │   │                                │
┌─────────────────────────┐    │   │ skill_drafts                   │
│ feed-service              │    │   │  id (PK)                       │
│  (자체 테이블 없음)         │    │   │  user_id ─┘                    │
│  users/skills/scraps를    │    │   │  thread_id, stage               │
│  읽기 전용 LEFT JOIN       │    │   │  skill_info (JSONB, 단일 누적)  │
└─────────────────────────┘    │   │                                │
                                │   │ scrap_folders                  │
                                │   │  id (PK)                       │
                                │   │  user_id ─┘                    │
                                │   │  name                          │
                                │   │                                │
                                │   │ scraps                         │
                                │   │  id (PK)                       │
                                └───┼─ user_id                       │
                                    │  skill_id (FK→skills.id)       │
                                    │  folder_id (FK→scrap_folders.id)│
                                    │  UNIQUE(user_id, skill_id)      │
                                    │                                │
                                    │ user_secrets                   │
                                    │  user_id (PK) ─┘                │
                                    │  anthropic_api_key_encrypted   │
                                    │  (BYOK, Fernet 암호화)          │
                                    │                                │
                                    │ categories                     │
                                    │  id (PK)                       │
                                    │  name, emoji                   │
                                    │  parent_id (FK→categories.id)  │
                                    │  NULL이면 대분류 / 값 있으면 소분류 │
                                    └────────────────────────────────┘

+ LangGraph checkpointer 테이블들 (skill-service, 자동 생성/관리)
  대화·스킬생성 메시지 이력 본문 저장 — thread_id로 chat_sessions/skill_drafts와 연결
```

| 테이블 | 소유 서비스 | 역할 | 비고 |
|---|---|---|---|
| `users` | user-service | 계정 | `(provider, provider_id)`로 식별, provider 다르면 별개 계정 |
| `refresh_tokens` | user-service | 리프레시 토큰 | 로그아웃 시 삭제, 1인 1토큰 |
| `skills` | skill-service | 등록된 스킬 | `category`는 `categories` 소분류 행의 id (FK), 카테고리명 Agent가 채움 |
| `categories` | skill-service | 카테고리 택소노미 | 대/소분류 자기참조 트리(`parent_id` NULL이면 대분류), 이름·이모지 포함. 재사용 우선 upsert |
| `chat_sessions` | skill-service | 대화 세션 메타 | 실제 메시지 본문은 없음(체크포인터가 보관) |
| `skill_drafts` | skill-service | 스킬 생성 진행 상태 | `skill_info` JSONB 하나에 5단계 결과 누적 |
| `scrap_folders` / `scraps` | skill-service | 스크랩 | 유저-스킬 조합은 폴더 무관하게 유일 |
| `user_secrets` | skill-service | BYOK 키 | `user_id`가 PK, 평문은 절대 안 내려줌 |
| (checkpointer 테이블) | skill-service | 대화·생성 메시지 이력 | LangGraph `AsyncPostgresSaver`가 자동 관리 |

각 테이블의 정확한 컬럼/타입은 `docs/specs/user-service-login.md` 6절,
`docs/specs/skill-service.md` 7절 참고.

---

## 3. 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Python 3.11, FastAPI, SQLAlchemy(async) + asyncpg |
| AI 에이전트 | LangGraph, langchain-anthropic (Claude) |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth(OAuth) + 자체 JWT(HS256) |
| 프론트엔드 | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4 |
| 인프라 | Docker Compose(로컬), Render(4개 서비스, 무료 플랜) |
| CI/CD | GitHub Actions — lint 통과 시에만 Render Deploy Hook 호출 (develop 브랜치) |

자세한 기술 선택 배경은 [`docs/tech-decisions.md`](docs/tech-decisions.md), 스킬 생성
파이프라인 상세 스펙은 [`docs/specs/skill-service.md`](docs/specs/skill-service.md) 참고.

---

## 4. Docker 설치

### Mac

1. [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) 다운로드
   - Apple Silicon(M1/M2/M3)과 Intel 칩 버전이 다르므로 본인 Mac에 맞는 버전 선택
2. 다운로드한 `.dmg` 파일 실행 → Docker 아이콘을 Applications 폴더로 드래그
3. Applications에서 Docker 실행 → 상단 메뉴바에 고래 아이콘이 뜨면 완료
4. 설치 확인:
   ```bash
   docker --version
   docker compose version
   ```

### Windows

1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 다운로드
2. 설치 전 WSL 2 활성화 필요 (PowerShell 관리자 권한으로 실행):
   ```powershell
   wsl --install
   ```
   설치 후 재부팅
3. 다운로드한 `.exe` 파일 실행 → 설치 완료 후 재부팅
4. Docker Desktop 실행 → 작업표시줄 트레이에 고래 아이콘이 뜨면 완료
5. 설치 확인:
   ```powershell
   docker --version
   docker compose version
   ```

---

## 5. 프로젝트 설정

### 5.1 저장소 클론

```bash
git clone https://github.com/Ivy-cho/skillSNS.git
cd skillSNS
```

### 5.2 .env 파일 작성

각 서비스 디렉토리에 `.env` 파일을 만듭니다. `.env.example` 참고.

**user-service/.env**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
DATABASE_URL=postgresql+asyncpg://postgres:password@db.your-project.supabase.co:5432/postgres
JWT_SECRET_KEY=your-secret-key-min-32-chars
CALLBACK_URL=http://localhost:8001/auth/callback
```

**skill-service/.env**
```
DATABASE_URL=postgresql+asyncpg://postgres:password@db.your-project.supabase.co:5432/postgres
JWT_SECRET_KEY=...        # user-service와 반드시 동일한 값
ANTHROPIC_API_KEY=...
SECRET_ENCRYPTION_KEY=... # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**feed-service/.env**
```
DATABASE_URL=postgresql+asyncpg://postgres:password@db.your-project.supabase.co:5432/postgres
```
user-service/skill-service와 같은 DB를 가리켜야 합니다 — feed-service는 자체 테이블 없이
`users`/`skills`/`scraps`를 읽기 전용으로 조회만 합니다.

---

## 6. 실행

### 방법 1 — Docker Compose (권장)

Docker Desktop이 실행 중인 상태에서:

```bash
docker compose up --build
```

처음 실행 시 이미지 빌드로 수 분 소요됩니다. 이후 실행부터는 빠릅니다.

종료:
```bash
docker compose down
```

### 방법 2 — 로컬 직접 실행

Python 3.11 이상 필요.

의존성 설치:
```bash
cd user-service && pip install -r requirements.txt
cd ../skill-service && pip install -r requirements.txt
cd ../feed-service && pip install -r requirements.txt
```

서버 실행 (터미널 3개):
```bash
# 터미널 1
cd user-service
python -m uvicorn main:app --port 8001

# 터미널 2
cd skill-service
python run.py        # Windows는 반드시 run.py로 실행 (uvicorn 직접 실행 시 오류 발생)

# 터미널 3
cd feed-service
python -m uvicorn main:app --port 8003
```

---

## 7. 배포 (Render + GitHub Actions)

**전부 무료 플랜으로 배포되고, 4개 서비스 모두 각자의 `Dockerfile`로 실제 Docker
이미지를 빌드해서 그 컨테이너를 그대로 실행합니다** (Render의 `env: docker`).

`develop` 브랜치에 push하면 GitHub Actions(`deploy.yml`)가 백엔드 lint(ruff) +
프론트 타입체크·lint(tsc/eslint)를 돌리고, 전부 통과해야 Render Deploy Hook 4개를
차례로 호출해 자동 배포합니다. `backend`/`frontend`/`main` 브랜치는 별도
워크플로(`ci.yml`)가 배포 없이 같은 검사만 돌려서, 머지 전에 문제를 미리 잡습니다.

### 7.1 Render 초기 설정

1. [Render](https://render.com) 회원가입 → GitHub 계정 연동

2. 대시보드에서 **New → Blueprint** 선택 → 이 저장소 연결
   - `render.yaml`을 자동으로 인식해 4개 서비스(user/skill/feed-service + frontend)를
     생성함 — 전부 `env: docker`라 각자 디렉토리의 `Dockerfile`로 빌드됨
   - ⚠️ **이름 충돌 주의**: 같은 이름의 서비스를 지웠다가 다시 만들면, Render가 그
     이름을 바로 안 풀어줘서 뒤에 임의 문자열이 붙은 이름(`skillsns-frontend-xxxx`
     식)으로 생성될 수 있습니다(Render 쪽 알려진 동작 — 기다려도 안 풀리는 경우가
     많음). 이 경우 아래 URL들을 실제로 생성된 이름 기준으로 맞춰야 합니다. (11.2절 참고)

3. 각 서비스에서 `sync: false`로 표시된 환경변수를 채워넣습니다 (Dashboard → 서비스 →
   Environment). `value:`가 이미 있는 값(예: `CORS_ORIGINS`, `NEXT_PUBLIC_*`)은
   서비스 이름이 `render.yaml` 그대로라면 손댈 필요 없습니다.

   **skillsns-user-service**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_KEY=...
   DATABASE_URL=postgresql+asyncpg://...
   JWT_SECRET_KEY=...
   CALLBACK_URL=https://skillsns-frontend.onrender.com/auth/callback
   ```

   **skillsns-skill-service**
   ```
   DATABASE_URL=postgresql+asyncpg://...
   JWT_SECRET_KEY=...    # user-service와 동일한 값
   ANTHROPIC_API_KEY=...
   SECRET_ENCRYPTION_KEY=...    # 사용자 등록 Anthropic 키 암호화용, 로컬 .env와 별도로 새로 발급 권장
   ```

   **skillsns-feed-service**
   ```
   DATABASE_URL=postgresql+asyncpg://...
   ```

   > `CALLBACK_URL`은 **프론트엔드의 콜백 페이지**(`skillsns-frontend` 서비스의
   > `/auth/callback`)를 가리켜야 합니다 — user-service 자신의 URL이 아닙니다.
   > Supabase 대시보드 → Authentication → URL Configuration에도 동일한 주소를
   > Redirect URL로 등록해야 합니다(로컬 개발도 병행한다면 `localhost:3000` 콜백도
   > 같이 등록 — 11.4절 참고).
   >
   > 서비스 이름을 `render.yaml`과 다르게 바꿨다면, `render.yaml`의
   > `CORS_ORIGINS`/`NEXT_PUBLIC_*` 값도 실제 `.onrender.com` 도메인에 맞게 고쳐야
   > 합니다(Render 서비스 URL은 `https://<서비스명>.onrender.com` 규칙).

4. 각 서비스의 **Deploy Hook URL** 복사 — Dashboard → 서비스 → Settings → Deploy Hook

### 7.2 GitHub Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret 이름 | 값 |
|---|---|
| `RENDER_DEPLOY_HOOK_USER_SERVICE` | Render user-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_SKILL_SERVICE` | Render skill-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_FEED_SERVICE` | Render feed-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_FRONTEND` | Render frontend Deploy Hook URL |

### 7.3 동작 방식

```
git push (develop 브랜치)
  └─ GitHub Actions (deploy.yml)
       ├─ lint-backend (ruff: user/skill/feed-service)  ┐
       ├─ lint-frontend (tsc + eslint)                  ┴─ 실패 시 배포 중단
       └─ 전부 통과 시 Render Deploy Hook 4개 순차 호출 → 각자 Dockerfile로 빌드·배포

git push (backend / frontend / main 브랜치), 또는 위 4개 브랜치로의 PR
  └─ GitHub Actions (ci.yml) — 위와 같은 lint만 돌리고 배포는 하지 않음
```

> **Render 무료 플랜 주의사항**: 15분 이상 요청이 없으면 서비스가 슬립 상태로 전환됩니다.
> 첫 요청 시 30-50초 콜드 스타트가 발생합니다(4개 서비스 다 해당). 포트폴리오
> 용도면 충분합니다.

> **프론트를 Vercel로 대신 배포하고 싶다면**: `render.yaml`에서 `skillsns-frontend`
> 서비스만 빼고 나머지 3개(백엔드)는 그대로 두면 됩니다. Vercel은 Dockerfile을 쓰지
> 않고 Next.js를 직접 빌드하며, GitHub 연동만 해두면 `main` push 시 자동 배포됩니다
> (별도 GitHub Actions 설정 불필요). 이 경우 각 백엔드 서비스의 `CORS_ORIGINS`에
> Vercel 배포 도메인(`https://<프로젝트명>.vercel.app`)이 포함돼 있는지만 확인하면
> 됩니다 — `render.yaml`엔 이미 두 도메인이 모두 들어있습니다.

---

## 8. 테스트

### 8.0 배포된 환경 (Render)

| URL | 설명 |
|---|---|
| https://skillsns-frontend.onrender.com | 프론트엔드 — 실제 사용 화면 (로그인 후 스킬 생성·대화·피드) |
| https://skillsns-user-service.onrender.com/docs | user-service Swagger |
| https://skillsns-skill-service.onrender.com/docs | skill-service Swagger |
| https://skillsns-feed-service.onrender.com/docs | feed-service Swagger |

Render 무료 플랜이라 15분 이상 요청이 없으면 슬립 → 첫 요청에 30~50초 콜드 스타트가 있다
(11절 주의사항). 아래 8.1~8.3은 로컬(`localhost`)에서 직접 띄웠을 때 기준이다.

### 8.1 테스트 UI (브라우저)

| URL | 설명 |
|---|---|
| http://localhost:8001 | 소셜 로그인 테스트 |
| http://localhost:8002 | 스킬 관리 + AI 에이전트 대화 테스트 |
| http://localhost:8003/feed | 피드 목록 (JSON, 별도 테스트 UI 없음) |

**순서:**
1. `http://localhost:8001` 접속 → Google 로그인
2. 로그인 완료 후 **"Skill Service로 이동"** 버튼 클릭
3. 스킬 등록 → AI 에이전트와 대화

### 8.2 API 문서 (Swagger)

| URL | 설명 |
|---|---|
| http://localhost:8001/docs | user-service |
| http://localhost:8002/docs | skill-service |
| http://localhost:8003/docs | feed-service |

### 8.3 주요 API

**user-service**
```
GET  /auth/login/{provider}    # provider: google / kakao
GET  /auth/callback            # OAuth 콜백 (자동 처리됨)
GET  /auth/me                  # 현재 로그인 사용자 정보
PATCH /auth/me                 # 닉네임/소개글/프로필사진URL 수정
POST /auth/me/avatar           # 프로필 사진 업로드 (512px 리사이즈 + JPEG 통일, Supabase Storage)
POST /auth/refresh             # Access Token 갱신
POST /auth/logout              # 로그아웃
```

**skill-service**
```
POST   /skills                        # 스킬 등록
GET    /skills                        # 스킬 목록
GET    /skills/{id}                   # 스킬 상세
PATCH  /skills/{id}                   # 스킬 수정 (본인만)
DELETE /skills/{id}                   # 스킬 삭제 (본인만)
GET    /skills/{id}/download          # MD 파일 다운로드
GET    /categories                   # 카테고리 트리 목록 [{id,name,emoji,parent_id,skill_count}] (공개)
POST   /chat/{skill_id}               # 새 대화 시작 (message 생략 시 스킬이 먼저 인사·질문하는 오프닝 턴)
POST   /chat/{skill_id}/{session_id}  # 대화 이어가기
GET    /chat/{skill_id}/{session_id}  # 대화 기록 조회
GET    /chat/{skill_id}/latest        # 이 스킬의 최근 세션 이어보기 (없으면 null)
GET    /chat/sessions                 # 내 대화 목록 (채팅 목록 화면)

POST   /skills/create                       # 스킬 만들기 시작
POST   /skills/create/{draft_id}            # 대화 이어가기 (메시지/링크/파일)
POST   /skills/create/{draft_id}/improve    # 테스트 결과 보고 개선 시작
POST   /skills/create/{draft_id}/retest     # 개선 후 재테스트
GET    /skills/create/{draft_id}            # 진행 상황 조회
POST   /skills/create/{draft_id}/confirm    # 확정 → 실제 스킬 등록 (카테고리 자동 분류)
POST   /skills/create/{draft_id}/revert     # 직전 단계로 되돌리기
```

**scrap** (skill-service, prefix `/scrap`)
```
GET    /scrap/folders             # 내 스크랩 폴더 목록
POST   /scrap/folders             # 폴더 생성
PATCH  /scrap/folders/{id}        # 폴더 이름 변경
DELETE /scrap/folders/{id}        # 폴더 삭제 (안의 스크랩도 함께)
GET    /scrap                     # 내 스크랩 목록 (?folder_id= 필터)
POST   /scrap                     # 담기 (이미 있으면 폴더 이동)
DELETE /scrap/{skill_id}          # 빼기
```

**user-secrets** (skill-service, prefix `/me`) — BYOK: 대화하는 사람이 자기 Anthropic
키로 비용을 낸다. 계정 단위로 암호화 저장되어 등록 후엔 어느 기기에서 로그인해도 유지됨.
```
GET    /me/anthropic-key    # 등록 여부만 반환 ({ has_key }), 평문은 안 내려줌
PUT    /me/anthropic-key    # 등록/교체 ({ api_key })
DELETE /me/anthropic-key    # 삭제
```

**feed-service**
```
GET /feed?q=&sort=recent&category=&limit=20&offset=0
      # 스킬 피드 (작성자 닉네임·프로필 사진·스크랩 수·대분류 이름 포함)
      # q:        제목/소개/소분류/대분류/작성자 닉네임 ILIKE 검색 (생략 가능)
      # sort:     recent(기본) | views | scraps  — 그 외 값은 400
      # category: 소분류 id 또는 소분류/대분류 이름으로 정확일치 필터 (생략 가능, q와 병행 가능)
      # limit/offset: 페이징 (기본 20/0, 응답 길이<limit이면 마지막 페이지)
```

자세한 요청/응답 형식은 `docs/specs/skill-service.md` 참고.

---

## 9. 프론트엔드 연동 테스트

`frontend/`(Next.js)에서 실제 소셜 로그인으로 로그인한 뒤 skill-service의 스킬 만들기
파이프라인을 브라우저로 직접 테스트하는 방법. Docker 없이 Python/Node.js를 PC에 바로
설치해서 진행한다. 배경 설명과 문제 해결은
[`docs/frontend-integration.md`](docs/frontend-integration.md) 참고 — 여기는 실행 명령만.

**사전 설치**
- Python 3.11+ — Mac: `brew install python@3.11` / Windows: [python.org](https://www.python.org/downloads/windows/) (설치 시 "Add python.exe to PATH" 체크)
- Node.js 20+ — Mac: `brew install node` / Windows: [nodejs.org](https://nodejs.org/) LTS

**1) user-service, skill-service 실행** (`.env`는 5.2절 참고)
```bash
cd user-service
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```
```bash
cd skill-service
pip install -r requirements.txt
python run.py        # Windows는 꼭 run.py로 실행
```

**2) `frontend/.env.local` 작성**
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8002
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:8001
```

**3) frontend 실행**
```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000`에서 카카오/구글로 로그인 → 스킬 주제 정하기 → 내용 채우기 →
이름 정하기(이때 카테고리 자동 분류) → 테스트(3분 정도 소요) → 게시까지 눌러보면 된다.
자세한 체크리스트·트러블슈팅은 [`docs/frontend-integration.md`](docs/frontend-integration.md).

---

## 10. 구현 노트 / 설계 결정

깊은 배경 설명은 [`docs/tech-decisions.md`](docs/tech-decisions.md)와
[`docs/specs/`](docs/specs/)에 있고, 여기는 요점만.

- **MSA인데 DB는 하나** — 서비스 3개가 물리적으로 같은 Supabase Postgres를 쓰되,
  테이블 소유권은 서비스별로 나눈다(예: feed-service는 자기 테이블이 없고
  `skills`/`users`/`scraps`를 읽기 전용 조인만 한다). 토이 프로젝트 규모에서 DB를
  3개로 쪼개는 관리 비용이 이득보다 커서 내린 절충이다.
- **BYOK로 LLM 비용 분산** — 서버가 공용 Anthropic 키를 들고 있지 않고, 유저마다 본인
  키를 등록해서 쓴다(Fernet 암호화 저장, `user_secrets` 테이블). "대화하는 사람이 자기
  키로 낸다"는 원칙 — 키 없으면 LLM을 호출하지 않고 즉시 안내한다.
- **계정 식별은 `(provider, provider_id)` 쌍** — 이메일이 아니라 이 쌍으로 유저를
  찾는다. 그래서 같은 사람이 구글/카카오 양쪽으로 로그인하면 완전히 별개 계정이 된다
  (의도적 설계 — `docs/specs/user-service-login.md` 7절). 스킬/스크랩이 계정마다
  안 섞이는 이유가 여기 있다.
- **스킬 생성 파이프라인은 호출 하나 = 단계 하나** — 여러 단계를 한 요청에 자동으로
  묶지 않는다. 중간에 실패해도 "어디까지 반영됐는지"가 항상 명확해야 해서다
  (`docs/specs/skill-service.md` 4-1절).
- **카테고리는 사람이 아니라 Agent가 정한다** — 초기엔 사용자가 대화로 카테고리를
  고르게 했다가, "새 라벨 만들기"보다 "비슷한 스킬이 모일 자리 찾기"가 목표라는 판단으로
  기획을 바꿨다. 이름 확정 시점에 카테고리명 Agent가 스킬 내용만 보고 대/소분류를 붙이되,
  기존 `categories` 트리를 먼저 재사용하고 없을 때만 새로 만든다(`upsert_category`).
  분류가 실패하거나 키가 없어도 스킬은 "미분류"로 반드시 저장된다
  (`skill-service/app/agent/category_classifier.py`, `app/services/categories.py`).

---

## 11. 트러블슈팅 기록

### 11.1 프론트 배포 시 502 Bad Gateway
- **증상**: Render에 배포한 프론트 컨테이너가 빌드·기동 로그는 정상인데 실제 접속하면 502.
- **원인**: Next.js `standalone` 서버가 컨테이너 호스트명으로 바인딩되고 `0.0.0.0`으로
  바인딩되지 않음. 로컬 Docker Desktop은 포트 포워딩이 알아서 붙어서 문제가 안 드러났지만,
  Render의 프록시 기반 네트워킹은 `0.0.0.0` 바인딩이 아니면 컨테이너에 도달 못 함.
- **해결**: `frontend/Dockerfile` runner 스테이지에 `ENV HOSTNAME="0.0.0.0"` 추가.
- **교훈**: 로컬에서 "잘 되는데요"가 배포 환경의 네트워킹 방식까지 검증해주진 않는다.

### 11.2 Render 서비스 이름 충돌 (재생성 시 랜덤 접미사)
- **증상**: 기존 서비스를 지우고 같은 이름으로 다시 만들었더니 `skillsns-frontend-gxrh`
  처럼 뒤에 임의 문자열이 붙어서 생성됨. 이후 `render.yaml`의 `name` 필드를 그 이름에
  맞춰 고쳐 푸시했더니 `-gxrh-gxrh`로 접미사가 한 번 더 붙은 **중복 서비스**가 생성됨.
- **원인**: Render가 삭제된 서비스 이름/서브도메인을 바로 안 풀어주는 알려진 동작. 여기에
  Blueprint Auto-Sync가 `name` 필드 변경을 "기존 서비스의 rename"이 아니라 "새 리소스"로
  해석하면서 중복이 발생.
- **해결**: Auto-Sync를 끄고, 모든 서비스를 완전히 삭제한 뒤 접미사 없는 원래 이름으로
  깨끗하게 재생성.
- **교훈**: `render.yaml`의 `name`/`region`처럼 서비스 정체성에 관여하는 필드는 이미
  존재하는 서비스에 대해서는 절대 건드리지 않는다 — 배포는 Deploy Hook(서비스 정체성을
  안 건드림)에만 의존한다.

### 11.3 배포 후 응답이 미묘하게 느림
- **증상**: 로컬보다 Render 배포본이 체감상 느림 (에러는 없음).
- **원인**: 두 가지가 겹침 — ① Render 서비스 기본 리전(미국)과 Supabase DB 리전(서울,
  `ap-northeast-2`)이 멀어서 요청마다 리전 간 왕복이 발생. ② SQLAlchemy 엔진이
  `NullPool`이라 요청마다 DB 커넥션을 새로 맺고 끊음 — 커넥션 풀링이 없어 매번 TCP/TLS
  핸드셰이크 비용을 지불.
- **해결**: ① `render.yaml`에 `region: singapore` 추가(서울에 가장 가까운 Render 리전)로
  완화. ② SQLAlchemy 엔진을 `NullPool` → `AsyncAdaptedQueuePool`(`pool_size=5`,
  `max_overflow=5`, `pool_pre_ping=True`, `pool_recycle=300`)로 전환 — 커넥션을 재사용해
  요청마다 붙던 TCP/TLS 핸드셰이크를 없앴다. PgBouncer 호환 `connect_args`(익명 prepared
  statement)는 그대로 두고, PgBouncer가 끊는 유휴 커넥션은 `pool_pre_ping`이 체크아웃 때
  걸러낸다. 세 백엔드 모두 동일.
- **교훈**: "느리다"는 증상 하나에 원인이 여러 개 겹쳐 있을 수 있다. 하나 고치고 끝내지
  말고 나머지 후보도 목록으로 남겨뒀다가 실제로 다 처리한다.

### 11.4 로컬 로그인과 배포 로그인이 서로를 깨뜨림
- **증상**: Render 배포용으로 Supabase Redirect URL을 등록했더니, 로컬(`localhost:3000`)
  로그인이 갑자기 안 됨.
- **원인**: Supabase Redirect URL 목록에서 로컬 주소가 빠지면서, 로컬에서 로그인해도
  Supabase가 배포 도메인 콜백으로 리다이렉트해버림.
- **해결**: 로컬 콜백(`http://localhost:3000/auth/callback`)과 배포 콜백을 **동시에**
  Redirect URL 목록에 등록.
- **교훈**: "배포용으로 바꾼다"가 아니라 "배포용을 추가한다"로 생각해야 로컬 개발 환경이
  안 깨진다.

### 11.5 `DATABASE_URL`에 개행 문자가 섞여 들어감
- **증상**: user-service가 기동 직후 `InvalidCatalogNameError: database "postgres\n"
  does not exist`로 죽음.
- **원인**: Render 대시보드에 환경변수 값을 붙여넣을 때 `.env` 파일에서 줄바꿈까지 같이
  복사돼서, DB 이름 마지막에 `\n`이 포함됨.
- **해결**: 값 끝의 공백/개행 없이 URL 문자열만 재저장.
- **교훈**: 이런 에러는 값 자체보다 메시지에 찍힌 따옴표 안쪽을 그대로 읽으면 원인이
  바로 보인다(`"postgres` 다음 줄바꿈된 채로 `"`가 닫힘).

### 11.6 CI lint가 커밋 내용과 무관하게 들쭉날쭉 실패
- **증상**: 코드를 안 건드렸는데 `ruff check`가 어떤 실행에서는 통과, 어떤 실행에서는
  FastAPI `Depends()` 패턴(B008)과 `except Exception`(BLE001)을 오탐으로 잡아서 실패.
- **원인**: 워크플로가 `pip install ruff`로 버전을 안 고정해서, 실행 시점마다 다른 버전이
  깔리며 기본 활성 규칙셋이 달라짐.
- **해결**: `ci.yml`/`deploy.yml` 둘 다 `pip install ruff==0.15.22`로 버전 고정.
- **교훈**: CI에서 "안 건드렸는데 갑자기 실패"는 대부분 버전 미고정이 범인이다.

### 11.7 feed-service가 배포 직후 죽음 (`DATABASE_URL` 필드 누락)
- **증상**: `pydantic_core.ValidationError: DATABASE_URL Field required`로 기동 실패.
- **원인**: Render 서비스를 재생성하면서 `sync: false` 환경변수는 값이 안 옮겨져서
  `DATABASE_URL`을 다시 채워 넣는 걸 빠뜨림.
- **해결**: Render 대시보드에서 feed-service에 `DATABASE_URL` 추가.
- **교훈**: Blueprint 재적용 후 체크리스트에 `sync: false` 값 전부 재입력이 빠지지 않게
  7.1절에 표로 못박아 둔다.

### 11.8 "내 스킬이 안 보여요" — 실은 다른 계정이었다
- **증상**: 카카오로 로그인했는데 이전에 만든 스킬이 마이페이지에 하나도 안 보임.
- **원인**: 버그가 아니라 설계상 동작 — user-service는 `(provider, provider_id)`로
  계정을 식별해서, 같은 사람이 구글로 만든 스킬은 카카오 계정에서 안 보인다(10절
  "구현 노트" 참고). DB를 직접 조회해서 두 계정 각각에 스킬이 정상 저장돼 있음을 확인.
- **해결**: 원래 로그인했던 provider로 다시 로그인하면 그대로 보임. 계정 통합은 아직
  미구현(진행 중/다음 목록).
- **교훈**: "데이터가 안 보인다"고 항상 조회 버그는 아니다 — 먼저 DB를 직접 봐서 데이터가
  애초에 그 자리에 있는지부터 확인한다.

### 11.9 특정 프롬프트를 스킬로 등록하면 "⚠️ Failed to fetch"
- **증상**: HTML 태그·쉘 명령이 잔뜩 든 프롬프트("포트폴리오 페이지 만들기" 같은)를 "내 스킬
  넣기"나 대화로 등록하려 하면 브라우저에 `Failed to fetch`만 뜸. 평범한 프롬프트는 정상.
- **원인**: Render 앞단 **Cloudflare WAF**. 요청 본문에 `<div class="...">`·`<meta ...>`
  (XSS 패턴)와 `git push -f`·`gh api -X POST`·`| base64 -d`·`python -m http.server`
  (명령 주입 패턴)가 누적되면 OWASP 이상 점수(anomaly score)가 임계치를 넘어 **403 `Blocked`** 로 끊는다.
  이 응답은 앱에 도달조차 안 하고(`x-render-origin-server` 헤더 없음) CORS 헤더도 없어서
  브라우저엔 `Failed to fetch`로만 보인다. 개별 패턴 조각은 안 걸리고 "누적"돼야 걸린다.
- **진단**: 배포 백엔드에 그 본문을 `curl`로 직접 POST → `Server: cloudflare` +
  `<title>Blocked</title>` (221KB HTML), `uvicorn` 헤더 없음 = WAF 차단 확정. 같은 본문을
  base64로 감싸 보내면 통과(401까지 도달).
- **해결**: Render의 Cloudflare WAF는 우리가 못 만지므로, 프론트가 스킬 본문을 **base64로
  감싸 전송**하고(`content_encoding="base64"` / `message_encoding="base64"`) 서버가 받아서
  평문으로 되돌린다. 저장·표시는 그대로 평문. `POST /skills`, `PATCH /skills/{id}`,
  `POST /skills/create/{draft_id}` 세 경로에 적용.
- **교훈**: "특정 입력에서만 Failed to fetch"는 앱 로그에 아무것도 안 남으면 앞단(WAF/프록시)을
  의심한다. `curl`로 엣지 응답을 직접 보면 5분이면 갈린다.
