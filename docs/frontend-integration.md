# 프론트엔드 ↔ skill-service 연동 가이드

`frontend/`(Next.js)가 skill-service의 `/skills/create/*`를 직접 호출해서, 스킬 만들기
파이프라인(카테고리 선택 → 확정)을 브라우저로 테스트할 수 있다. README의 "6. 프론트엔드
연동 테스트"는 실행 명령어만 담고 있고, 이 문서엔 그 배경과 상세 절차, 문제 해결을 정리했다.

---

## 왜 임시 개발용 토큰이 필요한가

프론트엔드에 user-service 소셜 로그인(Google/Kakao) UI 자체는 붙었지만(로그인 →
`/auth/callback` → 토큰 저장까지 동작), user-service가 발급한 토큰을 skill-service가
그대로 검증할 수 있는지는 아직 확인되지 않았다(둘이 같은 `JWT_SECRET_KEY`/알고리즘을
쓰는지 여부, `frontend/BACKEND_HANDOFF.md` 참고). 그게 확인되기 전까지 skill-service의
`/skills/create/*` 엔드포인트를 로컬에서 테스트하려면 **skill-service와 같은
`JWT_SECRET_KEY`로 직접 서명한 토큰**을 만들어 써야 한다. 이건 실제 인증 흐름이 아니라
순수하게 로컬 배선을 확인하기 위한 우회로다 — 두 서비스 간 토큰 호환이 확인되면 이 우회로는
제거한다.

## 왜 CORS 설정이 필요한가

브라우저(`localhost:3000`)가 다른 오리진(`localhost:8002`)을 직접 호출하는 구조라
skill-service에 `CORSMiddleware`가 없으면 요청 자체가 브라우저에서 막힌다.
`skill-service/main.py`에 로컬 개발용으로 `http://localhost:3000`만 허용해뒀다 — 배포
시엔 실제 프론트 도메인으로 좁혀야 한다.

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

### 3. skill-service 실행

`.env` 파일은 README 2번 "프로젝트 설정"과 동일하게 준비돼 있어야 한다(Supabase
`DATABASE_URL`, `JWT_SECRET_KEY`, `ANTHROPIC_API_KEY`) — user-service나 Docker 없이
skill-service 하나만 직접 띄워도 이 테스트엔 충분하다.

```bash
cd skill-service
pip install -r requirements.txt      # Mac은 pip3
python run.py                        # Mac은 python3 run.py — Windows는 꼭 run.py로 실행
```

`http://localhost:8002/health`가 `{"status":"ok",...}`를 돌려주면 정상.

### 4. 임시 개발용 토큰 발급

```bash
cd skill-service
python -c "
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.core.config import settings

payload = {
    'sub': 'dev-frontend-tester',
    'email': 'dev@example.com',
    'type': 'access',
    'exp': datetime.now(timezone.utc) + timedelta(days=7),
}
print(jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM))
"
```
Mac 터미널(bash/zsh)과 Windows(PowerShell/cmd) 둘 다 그대로 붙여넣으면 된다. 터미널에
출력된 토큰 문자열을 복사해둔다(유효기간 7일).

### 5. `frontend/.env.local` 작성

`frontend/` 폴더에 `.env.local` 파일을 새로 만든다:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8002
NEXT_PUBLIC_DEV_TOKEN=<4번에서 복사한 토큰>
```

`.env.local`은 `.gitignore`에 걸려있어서 커밋되지 않는다.

### 6. frontend 실행

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` 접속(포트가 이미 쓰이고 있으면 Next.js가 자동으로 다음 포트를 잡는다 — 터미널에 뜨는 실제 URL 확인).

---

## 확인 순서

skill-service와 frontend가 **둘 다 떠 있는 상태**에서 카테고리 선택부터 눌러본다.

1. 카테고리 선택 → "안녕하세요! {카테고리}의 스킬 만들기를 시작할게요!" 문구가 뜨는지
2. 몇 가지 답하면 후보 카드(`choices`)가 뜨는지 (STEP 2 발산/수렴)
3. 스킬 내용을 채우고 나면 이름 후보 카드 + "또는 직접 이름을 지어주세요" 입력창이 뜨는지 (STEP 4)
4. "테스트 시작하기" → 실제로 스킬 켠 답변/baseline을 돌려 채점한다 — **3분 정도 걸릴 수 있다**(정상 동작, 로딩 중이지 멈춘 게 아님)
5. 게시 → 실제 `skills` 테이블에 `title`/`description`/`category`/`md_content`가 저장되는지

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
| 브라우저에서 요청 자체가 안 나감 / CORS 에러 | skill-service의 `CORSMiddleware`가 `http://localhost:3000`만 허용한다. 프론트를 다른 포트로 띄웠다면 `skill-service/main.py`의 `allow_origins`도 맞춰야 한다. |
| `401 UNAUTHORIZED` | `.env.local`의 토큰이 만료(7일)됐거나, `JWT_SECRET_KEY`가 skill-service `.env`와 다른 값일 수 있다. 토큰을 새로 발급받는다. |
| 백엔드는 200을 내려주는데 화면이 안 바뀜 | skill-service 터미널 로그(`POST /skills/create/...`)가 전부 200이면 백엔드 문제가 아니다. 브라우저 개발자 도구 Console/Network 탭에서 프론트 쪽 에러를 확인한다. |
| Windows에서 skill-service 실행 시 에러 | `uvicorn` 직접 실행하지 말고 꼭 `python run.py`로 실행한다(알려진 이슈). |
