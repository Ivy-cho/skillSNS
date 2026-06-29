# 기능 명세서 - skill-service

- **작성일**: 2026-06-29
- **서비스**: skill-service
- **버전**: v1.0

---

## 1. 개요

사용자가 자신의 전문 지식을 `.md` 파일로 등록하면, 해당 내용을 기반으로 LLM 에이전트가 생성된다.
다른 사용자는 원하는 전문가(스킬)를 선택해 에이전트와 대화할 수 있다.
비로그인 사용자는 LLM을 호출하지 않고 안내 메시지만 반환한다.

---

## 2. 기술 스택

| 항목 | 기술 |
|---|---|
| Framework | FastAPI |
| LLM | Claude API (`claude-sonnet-4-6`) |
| Agent | LangChain + LangGraph |
| 대화 상태 저장 | LangGraph PostgreSQL Checkpointer |
| DB | PostgreSQL (Supabase) |
| 인증 | user-service 발급 JWT 검증 |

---

## 3. 주요 기능

| 기능 | 로그인 필요 | 구현 여부 |
|---|---|---|
| 스킬 등록 | ✅ | ✅ 구현 완료 |
| 스킬 목록 조회 | ❌ | ✅ 구현 완료 |
| 스킬 상세 조회 (MD 내용 포함) | ❌ | ✅ 구현 완료 |
| 스킬 MD 파일 다운로드 | ❌ | ✅ 구현 완료 |
| 스킬 수정 | ✅ (본인만) | ✅ 구현 완료 |
| 스킬 삭제 | ✅ (본인만) | ✅ 구현 완료 |
| 에이전트 대화 | ✅ (비로그인 시 안내 메시지) | ✅ 구현 완료 |
| 대화 기록 조회 | ✅ | ✅ 구현 완료 |

---

## 4. 에이전트 구조

스킬 하나 = 에이전트 하나

```
사용자 A  →  스킬 "Python 전문가"  →  에이전트 A-1
          →  스킬 "UI 디자인"      →  에이전트 A-2

사용자 B  →  스킬 "마케팅 전략"    →  에이전트 B-1
```

각 에이전트는 해당 스킬의 `.md` 내용을 system prompt로 사용해 그 전문가처럼 응답한다.

---

## 5. 대화 플로우

```
클라이언트
  │
  │  1. 대화 요청 (skill_id, message)
  ▼
skill-service
  │
  │  2. JWT 검증
  │     - 비로그인 → LLM 미호출, 안내 메시지 즉시 반환
  │     - 로그인 → 다음 단계 진행
  │
  │  3. skills 테이블에서 md_content 조회
  │
  │  4. LangGraph 에이전트 호출
  │     - system prompt: md_content
  │     - thread_id: session_id (대화 연속성 유지)
  │     - PostgreSQL Checkpointer가 대화 상태 저장
  │
  │  5. 응답 반환
  ▼
클라이언트
```

---

## 6. API 명세

### 6-1. 스킬 등록

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills` |
| 설명 | 스킬을 등록한다. 스킬 하나당 .md 파일 하나가 생성된다. |
| 인증 | Access Token 필요 |

**Request Header**
```
Authorization: Bearer {access_token}
```

**Request Body**
```json
{
  "title": "Python 전문가",
  "description": "Python 백엔드 개발 10년 경력",
  "md_content": "# Python 전문가\n\n## 전문 분야\n..."
}
```

**응답 (201 Created)**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Python 전문가",
  "description": "Python 백엔드 개발 10년 경력",
  "created_at": "2026-06-29T00:00:00Z"
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 422 | VALIDATION_ERROR | 필수 필드 누락 |

---

### 6-2. 전체 스킬 목록 조회

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/skills` |
| 설명 | 등록된 모든 스킬 목록을 반환한다. md_content는 포함하지 않는다. |
| 인증 | 불필요 |

**Query Parameter**
| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| user_id | UUID | ❌ | 특정 사용자의 스킬만 필터링 |

**응답 (200 OK)**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "title": "Python 전문가",
    "description": "Python 백엔드 개발 10년 경력",
    "created_at": "2026-06-29T00:00:00Z"
  }
]
```

---

### 6-3. 스킬 상세 조회

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/skills/{skill_id}` |
| 설명 | 스킬 상세 정보와 md_content를 반환한다. |
| 인증 | 불필요 |

**응답 (200 OK)**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Python 전문가",
  "description": "Python 백엔드 개발 10년 경력",
  "md_content": "# Python 전문가\n\n## 전문 분야\n...",
  "created_at": "2026-06-29T00:00:00Z"
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |

---

### 6-4. 스킬 MD 파일 다운로드

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/skills/{skill_id}/download` |
| 설명 | 스킬의 md_content를 .md 파일로 다운로드한다. |
| 인증 | 불필요 |

**응답 (200 OK)**
```
Content-Type: text/markdown
Content-Disposition: attachment; filename="{title}.md"
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |

---

### 6-5. 스킬 수정

| 항목 | 내용 |
|---|---|
| Method | `PATCH` |
| URL | `/skills/{skill_id}` |
| 설명 | 스킬 정보를 부분 수정한다. 요청에 포함된 필드만 업데이트된다. |
| 인증 | Access Token 필요 (본인만 수정 가능) |

**Request Header**
```
Authorization: Bearer {access_token}
```

**Request Body** (모두 선택)
```json
{
  "title": "수정된 제목",
  "description": "수정된 설명",
  "md_content": "# 수정된 내용\n..."
}
```

**응답 (200 OK)** — 수정된 스킬 전체 정보 (md_content 포함)
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "수정된 제목",
  "description": "수정된 설명",
  "md_content": "# 수정된 내용\n...",
  "created_at": "2026-06-29T00:00:00Z"
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 스킬이 아님 |
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |

---

### 6-6. 스킬 삭제

| 항목 | 내용 |
|---|---|
| Method | `DELETE` |
| URL | `/skills/{skill_id}` |
| 설명 | 스킬을 삭제한다. 관련 chat_sessions도 함께 삭제된다. |
| 인증 | Access Token 필요 (본인만 삭제 가능) |

**응답 (200 OK)**
```json
{
  "message": "스킬이 삭제되었습니다."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 스킬이 아님 |
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |

---

### 6-7. 대화 세션 시작 (새 대화)

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/chat/{skill_id}` |
| 설명 | 새 대화 세션을 생성하고 첫 메시지를 전송한다. |
| 인증 | Access Token 필요 (비로그인 시 안내 메시지 반환) |

**Request Body**
```json
{
  "message": "Python에서 async/await를 설명해줘"
}
```

**응답 - 로그인 (200 OK)**
```json
{
  "session_id": "uuid",
  "reply": "Python의 async/await는..."
}
```

**응답 - 비로그인 (200 OK)**
```json
{
  "session_id": null,
  "reply": "전문가와 대화하려면 로그인이 필요합니다."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |

---

### 6-8. 대화 이어가기

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/chat/{skill_id}/{session_id}` |
| 설명 | 기존 세션에 메시지를 추가해 대화를 이어간다. |
| 인증 | Access Token 필요 |

**Request Body**
```json
{
  "message": "그럼 asyncio.gather는 어떻게 써?"
}
```

**응답 (200 OK)**
```json
{
  "session_id": "uuid",
  "reply": "asyncio.gather는 여러 코루틴을..."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 세션이 아님 |
| 404 | SESSION_NOT_FOUND | 존재하지 않는 세션 |

---

### 6-9. 대화 기록 조회

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/chat/{skill_id}/{session_id}` |
| 설명 | 세션의 전체 대화 기록을 반환한다. |
| 인증 | Access Token 필요 |

**응답 (200 OK)**
```json
{
  "session_id": "uuid",
  "skill_id": "uuid",
  "messages": [
    { "role": "user", "content": "Python에서 async/await를 설명해줘" },
    { "role": "assistant", "content": "Python의 async/await는..." },
    { "role": "user", "content": "그럼 asyncio.gather는 어떻게 써?" },
    { "role": "assistant", "content": "asyncio.gather는 여러 코루틴을..." }
  ]
}
```

---

## 7. DB 설계

### skills
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK, 자동 생성 |
| user_id | UUID | FK → users.id (user-service) |
| title | VARCHAR | 스킬 이름 |
| description | TEXT | 스킬 설명 |
| md_content | TEXT | .md 파일 전체 내용 |
| created_at | TIMESTAMP | 등록일 |
| updated_at | TIMESTAMP | 수정일 |

### chat_sessions
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK, 자동 생성 |
| user_id | UUID | 대화를 시작한 사용자 |
| skill_id | UUID | FK → skills.id |
| thread_id | VARCHAR | LangGraph Checkpointer thread ID |
| created_at | TIMESTAMP | 세션 생성일 |

> 대화 메시지는 LangGraph PostgreSQL Checkpointer가 별도 테이블로 자동 관리한다.

---

## 8. 비즈니스 규칙

- 사용자는 스킬을 여러 개 등록할 수 있다.
- 스킬 삭제 시 해당 스킬의 모든 chat_sessions를 함께 삭제한다.
- 비로그인 사용자는 스킬 목록/조회/다운로드는 가능하나 대화는 불가능하다.
- 비로그인 대화 요청 시 LLM을 호출하지 않고 안내 메시지를 즉시 반환한다.
- 대화 세션은 본인만 접근 가능하다.
- `thread_id`는 `session_id`와 동일한 값을 사용한다.
