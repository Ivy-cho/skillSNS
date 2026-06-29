# skillSNS

Agent 오케스트레이션을 활용한 Skill SNS MSA 서비스.
사용자가 자신의 스킬을 공유하고 AI 에이전트와 대화하며 연결되는 소셜 네트워크 플랫폼.

## 서비스 구성

| 서비스 | 포트 | 역할 |
|---|---|---|
| user-service | 8001 | 소셜 로그인 / JWT 인증 |
| skill-service | 8002 | 스킬 관리 / AI 에이전트 대화 |

---

## 실행 방법

### 사전 준비 — .env 파일 작성

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

### 방법 1 — Docker Compose (권장)

```bash
docker compose up --build
```

---

### 방법 2 — 로컬 직접 실행

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
python run.py        # Windows는 반드시 run.py로 실행
```

---

## 테스트

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
```
