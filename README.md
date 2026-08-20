# skillSNS

> 🚧 **개발 진행중** — 핵심 기능(로그인, 스킬 생성 파이프라인, 대화, 피드, 스크랩, 채팅
> 목록)은 실 DB와 붙어 동작하지만, 아직 프로덕션 배포 전 마무리 단계다. 진행 상황은
> [`frontend/BACKEND_HANDOFF.md`](frontend/BACKEND_HANDOFF.md)에 실시간으로 정리하고 있다.

**개인이 가진 기술(노하우)을 나누고, 다른 사람의 기술을 이용할 수 있는 서비스**를
기획하고 MSA 구조로 직접 구현했다. 사용자는 자신의 전문성을 AI 챗봇 형태의 "스킬"로
만들어 공유하고, 다른 사람이 만든 스킬과 대화하며 그 기술을 실제로 이용할 수 있다.

## 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | skillSNS |
| 상태 | 🚧 개발 진행중 (핵심 기능 구현 완료, 프로덕션 배포 마무리 전) |
| 목적 | Agent/Prompt 오케스트레이션을 활용한 Skill SNS 서비스 (포트폴리오용 토이 프로젝트) |
| 아키텍처 | MSA — 독립 배포되는 백엔드 3개(user/skill/feed-service) + Next.js 프론트엔드 1개 |
| 리포지토리 | [Ivy-cho/skillSNS](https://github.com/Ivy-cho/skillSNS) |
| 브랜치 전략 | `backend`(백엔드 작업) / `frontend`(프론트 작업) / `develop`(통합, Render 배포 트리거) / `main`(프론트 배포 트리거, Vercel) |
| 배포 | 백엔드 3개 — Render 무료 플랜 / 프론트엔드 — Vercel |

기술 선택 배경(왜 FastAPI인지, 왜 Supabase·Render인지 등)은
[`docs/tech-decisions.md`](docs/tech-decisions.md)에 별도로 정리돼 있다.

## 무엇을 만들었나

"면접 코치", "이직 자소서 첨삭러"처럼 스스로 잘 아는 분야를 AI 챗봇으로 빚어 남에게
내어주고, 반대로 남이 빚어낸 챗봇을 가져다 쓰는 순환이 서비스의 핵심이다.

### 주요 기능

- **AI와 함께 스킬 만들기** — 주제 정하기 → 내용 정하기 → 이름 정하기 → 테스트 →
  개선 → 게시, 5단계 대화형 파이프라인. 사용자가 만든 스킬을 실제로 가동해 스스로
  질문·답변 테스트를 돌리고 객관적 기준으로 채점한 뒤, 부족하면 사용자 모르게
  재작성까지 시도한다(`skill-service/app/agent/creator/`, LangGraph).
- **스킬과 대화하기** — 게시된 스킬의 시스템 프롬프트로 실제 LLM과 대화. 대화 세션은
  LangGraph의 Postgres 체크포인터에 저장되어 이어서 대화할 수 있다.
- **피드** — 전체 공개 스킬을 최신순으로 보여주고, 제목·소개·작성자·카테고리로
  검색. 상단 "요즘 뜨는 스킬"은 조회수 기준(동률이면 이름순) 트렌딩.
- **스크랩 + 폴더** — 마음에 드는 스킬을 폴더별로 정리해서 담아둔다.
- **채팅 목록** — 내가 대화해본 스킬들을 최근 대화순으로 모아본다.
- **소셜 로그인 + 프로필** — 카카오/구글 로그인, 닉네임·소개글·프로필 사진 편집.

### 아키텍처

MSA로 나뉜 4개 서비스가 프론트엔드 하나를 함께 지원하고, 백엔드 3개는 같은 Supabase
Postgres 인스턴스를 공유한다(서비스별 스키마 소유권은 지키되, 물리 DB는 하나).

```
Next.js(frontend)
   ├─ user-service   ── 소셜 로그인, JWT 발급, 프로필
   ├─ skill-service  ── 스킬 CRUD, AI 대화, 스킬 생성 파이프라인, 스크랩
   └─ feed-service   ── skills/users/scraps를 읽기 전용 조인, 피드 제공
                (셋 다 Supabase Postgres 하나를 공유)
```

| 서비스 | 포트 | 역할 |
|---|---|---|
| user-service | 8001 | 소셜 로그인 / JWT 인증 / 프로필 |
| skill-service | 8002 | 스킬 CRUD / AI 에이전트 대화 / 스킬 생성 파이프라인 / 스크랩 |
| feed-service | 8003 | 피드 조회 (skills/users/scraps를 읽기 전용으로 조회) |

### 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Python 3.11, FastAPI, SQLAlchemy(async) + asyncpg |
| AI 에이전트 | LangGraph, langchain-anthropic (Claude) |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth(OAuth) + 자체 JWT(HS256) |
| 프론트엔드 | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4 |
| 인프라 | Docker Compose(로컬), Render(백엔드 3개, 무료 플랜), Vercel(프론트엔드) |
| CI/CD | GitHub Actions — lint 통과 시 Render Deploy Hook 호출 |

자세한 기술 선택 배경은 [`docs/tech-decisions.md`](docs/tech-decisions.md), 스킬 생성
파이프라인 상세 스펙은 [`docs/specs/skill-service.md`](docs/specs/skill-service.md) 참고.

---

## 1. Docker 설치

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

## 2. 프로젝트 설정

### 저장소 클론

```bash
git clone https://github.com/Ivy-cho/skillSNS.git
cd skillSNS
```

### .env 파일 작성

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
```

**feed-service/.env**
```
DATABASE_URL=postgresql+asyncpg://postgres:password@db.your-project.supabase.co:5432/postgres
```
user-service/skill-service와 같은 DB를 가리켜야 합니다 — feed-service는 자체 테이블 없이
`users`/`skills`/`scraps`를 읽기 전용으로 조회만 합니다.

---

## 3. 실행

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

## 4. 배포 (Render + GitHub Actions)

**전부 무료 플랜으로 배포되고, 4개 서비스 모두 각자의 `Dockerfile`로 실제 Docker
이미지를 빌드해서 그 컨테이너를 그대로 실행합니다** (Render의 `env: docker`). 프론트도
Vercel의 자체 Next.js 빌드가 아니라 `frontend/Dockerfile`로 빌드된 컨테이너가 뜹니다.

`develop` 브랜치에 push하면 GitHub Actions(`deploy.yml`)가 백엔드 lint(ruff) +
프론트 타입체크·lint(tsc/eslint)를 돌리고, 전부 통과해야 Render Deploy Hook 4개를
차례로 호출해 자동 배포합니다. `backend`/`frontend`/`main` 브랜치는 별도
워크플로(`ci.yml`)가 배포 없이 같은 검사만 돌려서, 머지 전에 문제를 미리 잡습니다.

### 4-1. Render 초기 설정

1. [Render](https://render.com) 회원가입 → GitHub 계정 연동

2. 대시보드에서 **New → Blueprint** 선택 → 이 저장소 연결
   - `render.yaml`을 자동으로 인식해 4개 서비스(user/skill/feed-service + frontend)를
     생성함 — 전부 `env: docker`라 각자 디렉토리의 `Dockerfile`로 빌드됨

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
   ```

   **skillsns-feed-service**
   ```
   DATABASE_URL=postgresql+asyncpg://...
   ```

   > `CALLBACK_URL`은 **프론트엔드의 콜백 페이지**(`skillsns-frontend` 서비스의
   > `/auth/callback`)를 가리켜야 합니다 — user-service 자신의 URL이 아닙니다.
   > Supabase 대시보드 → Authentication → URL Configuration에도 동일한 주소를
   > Redirect URL로 등록해야 합니다.
   >
   > 서비스 이름을 `render.yaml`과 다르게 바꿨다면, `render.yaml`의
   > `CORS_ORIGINS`/`NEXT_PUBLIC_*` 값도 실제 `.onrender.com` 도메인에 맞게 고쳐야
   > 합니다(Render 서비스 URL은 `https://<서비스명>.onrender.com` 규칙).

4. 각 서비스의 **Deploy Hook URL** 복사 — Dashboard → 서비스 → Settings → Deploy Hook

### 4-2. GitHub Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret 이름 | 값 |
|---|---|
| `RENDER_DEPLOY_HOOK_USER_SERVICE` | Render user-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_SKILL_SERVICE` | Render skill-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_FEED_SERVICE` | Render feed-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_FRONTEND` | Render frontend Deploy Hook URL |

### 4-3. 동작 방식

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

## 5. 테스트

### 테스트 UI (브라우저)

| URL | 설명 |
|---|---|
| http://localhost:8001 | 소셜 로그인 테스트 |
| http://localhost:8002 | 스킬 관리 + AI 에이전트 대화 테스트 |
| http://localhost:8003/feed | 피드 목록 (JSON, 별도 테스트 UI 없음) |

**순서:**
1. `http://localhost:8001` 접속 → Google 로그인
2. 로그인 완료 후 **"Skill Service로 이동"** 버튼 클릭
3. 스킬 등록 → AI 에이전트와 대화

### API 문서 (Swagger)

| URL | 설명 |
|---|---|
| http://localhost:8001/docs | user-service |
| http://localhost:8002/docs | skill-service |
| http://localhost:8003/docs | feed-service |

### 주요 API

**user-service**
```
GET  /auth/login/{provider}    # provider: google / kakao
GET  /auth/callback            # OAuth 콜백 (자동 처리됨)
GET  /auth/me                  # 현재 로그인 사용자 정보
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
POST   /chat/{skill_id}               # 새 대화 시작
POST   /chat/{skill_id}/{session_id}  # 대화 이어가기
GET    /chat/{skill_id}/{session_id}  # 대화 기록 조회
GET    /chat/sessions                 # 내 대화 목록 (채팅 목록 화면)

POST   /skills/create                       # 스킬 만들기 시작 (카테고리 선택)
POST   /skills/create/{draft_id}            # 대화 이어가기 (메시지/링크/파일)
POST   /skills/create/{draft_id}/improve    # 테스트 결과 보고 개선 시작
POST   /skills/create/{draft_id}/retest     # 개선 후 재테스트
GET    /skills/create/{draft_id}            # 진행 상황 조회
POST   /skills/create/{draft_id}/confirm    # 확정 → 실제 스킬 등록
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

**feed-service**
```
GET /feed    # 스킬 피드 (작성자 닉네임·스크랩 수 포함, 최신순)
```

자세한 요청/응답 형식은 `docs/specs/skill-service.md` 참고.

---

## 6. 프론트엔드 연동 테스트

`frontend/`(Next.js)에서 실제 소셜 로그인으로 로그인한 뒤 skill-service의 스킬 만들기
파이프라인을 브라우저로 직접 테스트하는 방법. Docker 없이 Python/Node.js를 PC에 바로
설치해서 진행한다. 배경 설명과 문제 해결은
[`docs/frontend-integration.md`](docs/frontend-integration.md) 참고 — 여기는 실행 명령만.

**사전 설치**
- Python 3.11+ — Mac: `brew install python@3.11` / Windows: [python.org](https://www.python.org/downloads/windows/) (설치 시 "Add python.exe to PATH" 체크)
- Node.js 20+ — Mac: `brew install node` / Windows: [nodejs.org](https://nodejs.org/) LTS

**1) user-service, skill-service 실행** (`.env`는 2번 참고)
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

`http://localhost:3000`에서 카카오/구글로 로그인 → 카테고리 선택 → 스킬 내용 채우기 →
이름 정하기 → 테스트(3분 정도 소요) → 게시까지 눌러보면 된다. 자세한
체크리스트·트러블슈팅은 [`docs/frontend-integration.md`](docs/frontend-integration.md).
