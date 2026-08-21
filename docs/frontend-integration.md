# 프론트엔드 ↔ 백엔드 연동 가이드

`frontend/`(Next.js)가 user-service로 실제 소셜 로그인을 하고, skill-service의
`/skills/create/*`를 직접 호출해서 스킬 만들기 파이프라인(카테고리 선택 → 확정)을
브라우저로 테스트할 수 있다. README의 "9. 프론트엔드 연동 테스트"는 실행 명령어만 담고
있고, 이 문서엔 그 배경과 상세 절차, 문제 해결을 정리했다.

---

## 인증은 어떻게 동작하나

user-service가 소셜 로그인을 처리해 자체 JWT를 발급하고(`/auth/callback`), 프론트는 이
토큰을 `localStorage`에 저장해 이후 모든 API 호출의 `Authorization: Bearer` 헤더로
쓴다(`frontend/src/lib/authClient.ts`). user-service와 skill-service가 같은
`JWT_SECRET_KEY`/알고리즘을 쓰도록 배선돼 있어, skill-service가 user-service 발급 토큰을
그대로 검증한다 — 별도의 개발용 토큰이나 우회 로그인은 필요 없다.

## 왜 CORS 설정이 필요한가

브라우저(`localhost:3000`)가 다른 오리진(`localhost:8001`, `localhost:8002`,
`localhost:8003`)을 직접 호출하는 구조라 각 서비스에 `CORSMiddleware`가 없으면 요청
자체가 브라우저에서 막힌다. 세 서비스 모두 `CORS_ORIGINS` 환경변수로 허용 오리진을
관리한다(`app/core/config.py`의 `cors_origins_list`) — 로컬 기본값은
`http://localhost:3000`이고, 배포 도메인은 `render.yaml`의 `CORS_ORIGINS` 값으로
따로 관리한다.

---

## 상세 설치 절차

### 1. Python 설치 (skill-service용, 3.11 이상)

**Mac**
```bash
brew install python@3.11
python3 --version
```
Homebrew가 없다면 [python.org](https://www.python.org/downloads/macos/)에서 설치 파일을 받아도 된다.

**Windows**
1. [python.org](https://www.python.org/downloads/windows/)에서 설치 파일 다운로드
2. 설치 시작 화면에서 **"Add python.exe to PATH"** 체크 필수
3. 설치 확인: `python --version`

> 이후 명령어는 Mac은 `python3`, Windows는 `python`으로 표기했다. Mac에서 `python`이 안 먹으면 `python3`로 바꿔 실행하면 된다.

### 2. Node.js 설치 (frontend용, 20 이상 권장)

**Mac**
```bash
brew install node
node --version
```

**Windows**
1. [nodejs.org](https://nodejs.org/)에서 **LTS** 버전 설치 파일 다운로드 후 실행
2. 설치 확인: `node --version`, `npm --version`

### 3. user-service, skill-service 실행

`.env` 파일은 README 5번 "프로젝트 설정"과 동일하게 준비돼 있어야 한다(Supabase
`DATABASE_URL`, `JWT_SECRET_KEY`, `ANTHROPIC_API_KEY` 등). 로그인까지 테스트하려면
user-service도 함께 띄워야 한다.

```bash
cd user-service
pip install -r requirements.txt      # Mac은 pip3
uvicorn main:app --port 8001 --reload
```
```bash
cd skill-service
pip install -r requirements.txt      # Mac은 pip3
python run.py                        # Mac은 python3 run.py — Windows는 꼭 run.py로 실행
```

`http://localhost:8001/health`, `http://localhost:8002/health`가 각각
`{"status":"ok",...}`를 돌려주면 정상.

### 4. `frontend/.env.local` 작성

`frontend/` 폴더에 `.env.local` 파일을 새로 만든다:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8002
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:8001
```

`.env.local`은 `.gitignore`에 걸려있어서 커밋되지 않는다.

### 5. frontend 실행

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` 접속(포트가 이미 쓰이고 있으면 Next.js가 자동으로 다음 포트를 잡는다 — 터미널에 뜨는 실제 URL 확인).

---

## 확인 순서

user-service, skill-service, frontend가 **모두 떠 있는 상태**에서 로그인부터 눌러본다.

1. `/login`에서 카카오 또는 구글로 로그인 → `/auth/callback`을 거쳐 `/home`으로 들어가는지
2. 카테고리 선택 → "안녕하세요! {카테고리}의 스킬 만들기를 시작할게요!" 문구가 뜨는지
3. 몇 가지 답하면 후보 카드(`choices`)가 뜨는지 (STEP 2 발산/수렴)
4. 스킬 내용을 채우고 나면 이름 후보 카드 + "또는 직접 이름을 지어주세요" 입력창이 뜨는지 (STEP 4)
5. "테스트 시작하기" → 실제로 스킬 켠 답변/baseline을 돌려 채점한다 — **3분 정도 걸릴 수 있다**(정상 동작, 로딩 중이지 멈춘 게 아님)
6. 게시 → 실제 `skills` 테이블에 `title`/`description`/`category`/`md_content`가 저장되는지

DB에 직접 확인하고 싶으면(Supabase 콘솔 또는 아래 명령):
```bash
cd skill-service
python -c "
import asyncio
from app.db.database import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        result = await conn.execute(text('SELECT id, title, category, created_at FROM skills ORDER BY created_at DESC LIMIT 5'))
        for r in result.fetchall():
            print(r)

asyncio.run(main())
"
```

`/skills/create/*`의 정확한 요청/응답 형식, 각 단계(`what_skill`/`skill_content`/
`skill_name`/`skill_test`/`skill_improve`)가 하는 일은 `docs/specs/skill-service.md`
4-1절·6-10~6-13절 참고.

---

## 문제 해결

| 증상 | 원인 / 확인할 것 |
|---|---|
| 브라우저에서 요청 자체가 안 나감 / CORS 에러 | user-service·skill-service의 `CORSMiddleware`가 `http://localhost:3000`만 허용한다. 프론트를 다른 포트로 띄웠다면 두 서비스 `main.py`의 `allow_origins`도 맞춰야 한다. |
| `401 UNAUTHORIZED` | 로그인 세션(access token, 1시간)이 만료됐을 수 있다 — 다시 로그인한다. 계속되면 user-service/skill-service `.env`의 `JWT_SECRET_KEY`가 서로 다른 값인지 확인한다. |
| 백엔드는 200을 내려주는데 화면이 안 바뀜 | skill-service 터미널 로그(`POST /skills/create/...`)가 전부 200이면 백엔드 문제가 아니다. 브라우저 개발자 도구 Console/Network 탭에서 프론트 쪽 에러를 확인한다. |
| Windows에서 skill-service 실행 시 에러 | `uvicorn` 직접 실행하지 말고 꼭 `python run.py`로 실행한다(알려진 이슈). |
