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
