# skillSNS

Agent 오케스트레이션을 활용한 Skill SNS MSA 서비스.
사용자가 자신의 스킬을 공유하고 AI 에이전트와 대화하며 연결되는 소셜 네트워크 플랫폼.

## 서비스 구성

| 서비스 | 포트 | 역할 |
|---|---|---|
| user-service | 8001 | 소셜 로그인 / JWT 인증 |
| skill-service | 8002 | 스킬 관리 / AI 에이전트 대화 |

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
```

서버 실행 (터미널 2개):
```bash
# 터미널 1
cd user-service
python -m uvicorn main:app --port 8001

# 터미널 2
cd skill-service
python run.py        # Windows는 반드시 run.py로 실행 (uvicorn 직접 실행 시 오류 발생)
```

---

## 4. 배포 (Render + GitHub Actions)

`backend` 브랜치에 push하면 GitHub Actions가 lint를 실행하고, 통과 시 Render에 자동 배포됩니다.

### 4-1. Render 초기 설정

1. [Render](https://render.com) 회원가입 → GitHub 계정 연동

2. 대시보드에서 **New → Blueprint** 선택 → 이 저장소 연결
   - `render.yaml`을 자동으로 인식해 두 서비스를 생성함

3. 각 서비스에서 환경변수 설정 (Dashboard → 서비스 → Environment)

   **skillsns-user-service**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_KEY=...
   DATABASE_URL=postgresql+asyncpg://...
   JWT_SECRET_KEY=...
   CALLBACK_URL=https://skillsns-user-service.onrender.com/auth/callback
   ```

   **skillsns-skill-service**
   ```
   DATABASE_URL=postgresql+asyncpg://...
   JWT_SECRET_KEY=...    # user-service와 동일한 값
   ANTHROPIC_API_KEY=...
   ```

   > `CALLBACK_URL`은 Render가 서비스를 생성한 뒤 확인할 수 있는 실제 URL로 입력합니다.
   > Supabase 대시보드 → Authentication → URL Configuration에도 동일하게 등록해야 합니다.

4. 각 서비스의 **Deploy Hook URL** 복사
   - Dashboard → 서비스 → Settings → Deploy Hook

### 4-2. GitHub Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret 이름 | 값 |
|---|---|
| `RENDER_DEPLOY_HOOK_USER_SERVICE` | Render user-service Deploy Hook URL |
| `RENDER_DEPLOY_HOOK_SKILL_SERVICE` | Render skill-service Deploy Hook URL |

### 4-3. 동작 방식

```
git push (backend 브랜치)
  └─ GitHub Actions
       ├─ lint (ruff) → 실패 시 배포 중단
       └─ 통과 시 Render Deploy Hook 호출 → 자동 배포
```

> **Render 무료 플랜 주의사항**: 15분 이상 요청이 없으면 서비스가 슬립 상태로 전환됩니다.
> 첫 요청 시 30-50초 콜드 스타트가 발생합니다. 포트폴리오 용도면 충분합니다.

---

## 5. 테스트

### 테스트 UI (브라우저)

| URL | 설명 |
|---|---|
| http://localhost:8001 | 소셜 로그인 테스트 |
| http://localhost:8002 | 스킬 관리 + AI 에이전트 대화 테스트 |

**순서:**
1. `http://localhost:8001` 접속 → Google 로그인
2. 로그인 완료 후 **"Skill Service로 이동"** 버튼 클릭
3. 스킬 등록 → AI 에이전트와 대화

### API 문서 (Swagger)

| URL | 설명 |
|---|---|
| http://localhost:8001/docs | user-service |
| http://localhost:8002/docs | skill-service |

### 주요 API

**user-service**
```
GET  /auth/login/{provider}    # provider: google / kakao / naver
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

POST   /skills/create                       # 스킬 만들기 시작 (카테고리 선택)
POST   /skills/create/{draft_id}            # 대화 이어가기 (메시지/링크/파일)
POST   /skills/create/{draft_id}/improve    # 테스트 결과 보고 개선 시작
POST   /skills/create/{draft_id}/retest     # 개선 후 재테스트
GET    /skills/create/{draft_id}            # 진행 상황 조회
POST   /skills/create/{draft_id}/confirm    # 확정 → 실제 스킬 등록
```

자세한 요청/응답 형식은 `docs/specs/skill-service.md` 참고.

---

## 6. 프론트엔드 연동 테스트

`frontend/`(Next.js)에서 skill-service의 스킬 만들기 파이프라인을 브라우저로 직접
테스트하는 방법. Docker 없이 Python/Node.js를 PC에 바로 설치해서 진행한다. 배경 설명과
문제 해결은 [`docs/frontend-integration.md`](docs/frontend-integration.md) 참고 — 여기는
실행 명령만.

**사전 설치**
- Python 3.11+ — Mac: `brew install python@3.11` / Windows: [python.org](https://www.python.org/downloads/windows/) (설치 시 "Add python.exe to PATH" 체크)
- Node.js 20+ — Mac: `brew install node` / Windows: [nodejs.org](https://nodejs.org/) LTS

**1) skill-service 실행** (`.env`는 2번 참고)
```bash
cd skill-service
pip install -r requirements.txt
python run.py        # Windows는 꼭 run.py로 실행
```

**2) 임시 개발용 토큰 발급** (로그인 UI가 아직 없어서 로컬 테스트용으로 직접 서명)
```bash
cd skill-service
python -c "
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.core.config import settings
payload = {'sub': 'dev-frontend-tester', 'email': 'dev@example.com', 'type': 'access', 'exp': datetime.now(timezone.utc) + timedelta(days=7)}
print(jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM))
"
```

**3) `frontend/.env.local` 작성**
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8002
NEXT_PUBLIC_DEV_TOKEN=<2번에서 나온 토큰>
```

**4) frontend 실행**
```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000`에서 카테고리 선택 → 스킬 내용 채우기 → 이름 정하기 → 테스트(3분
정도 소요) → 게시까지 눌러보면 된다. 자세한 체크리스트·트러블슈팅은
[`docs/frontend-integration.md`](docs/frontend-integration.md).
