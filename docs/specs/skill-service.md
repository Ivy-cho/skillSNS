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
| AI 스킬 생성(5단계 인터뷰 파이프라인) | ✅ | ✅ 구현 완료 (`/skills/create/*`, 아래 4-1절 참고) |

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

## 4-1. 생성 에이전트 구조 (`app/agent/creator/`)

스킬 등록 전, `skillsns-main` 프론트엔드의 `workflows/*.md` 설계를 그대로 옮긴 5단계 LangGraph 파이프라인. 각 단계는 `app/prompts/skill_creation/`의 프롬프트 파일 하나씩과 1:1로 대응하고, 프롬프트 파일 자체가 그 단계의 절차/품질 기준을 담고 있다(코드는 `app/agent/creator/stage_runner.py` 하나가 4개 단계를 공유 실행).

```
START ──(state.stage 값으로 바로 진입)──┐
                                        ▼
                              ┌─────────────┐
                              │ what_skill  │
                              └─────────────┘
                                    │ tool_call 없음 → END (다음 사용자 메시지 대기, stage 그대로)
                                    │ tool_call 있음 → skill_info 반영 + state.stage="skill_content" → END
                              ┌─────────────┐
                              │skill_content│  (동일한 패턴)
                              └─────────────┘
                              ┌─────────────┐
                              │ skill_name  │  (동일한 패턴, 완료 시 stage="skill_test")
                              └─────────────┘
                              ┌─────────────┐
                              │ skill_test  │  실제로 스킬 켠 답변 vs baseline(스킬 없이)
                              └─────────────┘  답변을 돌려 채점 (전용 구현, 아래 참고)
                                    │
                     사용자가 결과 보고 선택 (다음 요청을 뭘로 보내느냐로 결정)
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          POST .../improve                  POST .../confirm
                    │
                    ▼
            ┌──────────────┐
            │skill_improve │  skill_content와 같은 방식으로 부족한 영역만 재인터뷰
            └──────────────┘
                    │
          사용자가 다시 skill_test 요청(POST .../retest) 또는 확정
```

- **호출 하나 = 단계 하나.** 어떤 단계도 완료 즉시 다음 단계로 자동으로 이어가지 않는다 — `tool_call`이 나면 그 안에서 `skill_info`를 반영하고 `state.stage`만 다음 단계로 바꾼 뒤 그 자리에서 끝난다(`END`). 다음 단계로 넘어갈지, 언제 넘어갈지는 전적으로 **클라이언트가 다음 요청을 보내는 시점**이 결정한다 — 그 요청이 오면 `START`가 이미 바뀐 `state.stage`를 보고 알아서 그 단계 노드로 들어간다.
  - 이렇게 설계한 이유: 여러 단계를 한 호출에 자동으로 묶으면, 호출 중간에 실패했을 때 "어디까지 반영됐는지"가 애매해진다(실제로 이 문제로 tool_result 처리 버그가 한 번 났었다). 호출 하나가 단계 하나에 정확히 대응해야 부분 실패 시에도 상태가 항상 명확하다.
  - 그래서 한 번의 `POST /skills/create/{id}` 응답의 `messages` 배열은 (skill_test의 질문확정→채점처럼 한 단계 내부에서 LLM을 여러 번 부르는 경우가 아니면) 보통 새 AI 메시지 1개만 담는다.
- `skill_test`는 나머지 4개와 달리 전용 구현(`test_node.py`)이 필요하다 — LLM이 테스트 질문을 확정하면, 코드가 실제로 임시 스킬 에이전트와 baseline(스킬 없는) 에이전트를 둘 다 띄워 그 질문들을 돌리고, 그 결과(+실측 응답시간/토큰)를 다시 LLM에 넘겨 8개 영역을 채점시킨다. (이건 같은 단계 안에서 스스로 할 일을 마치는 것이지, 다음 단계로 자동 전환하는 게 아니라서 위 원칙과 모순되지 않는다.)
- `skill_test`와 `skill_improve`는 완료돼도 자동으로 서로 넘어가지 않는다 — 사용자가 결과를 보고 개선/재테스트/확정을 직접 고르며, 그 전환은 API 라우트가 `SkillDraft.stage`를 바꿔서 처리한다.
- 각 단계가 채우는 `skill_info` 필드는 `app/prompts/skill_creation/schemas/skill_info.schema.json`에, `skill_test`의 출력 구조는 `test_report.schema.json`에 정의돼 있다.

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
  "md_content": "# Python 전문가\n\n## 전문 분야\n...",
  "category": "커리어"
}
```

**응답 (201 Created)**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Python 전문가",
  "description": "Python 백엔드 개발 10년 경력",
  "category": "커리어",
  "created_at": "2026-06-29T00:00:00Z"
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 422 | (FastAPI 기본 유효성 검사) | title/md_content 등 필수 필드 누락 — 커스텀 에러코드 아님, pydantic 기본 오류 형식 |

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
    "category": "커리어",
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
  "category": "커리어",
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

**응답 - 로그인 (200 OK)**
```json
{
  "session_id": "uuid",
  "reply": "asyncio.gather는 여러 코루틴을..."
}
```

**응답 - 비로그인 (200 OK)** — 6-7과 동일하게 에러가 아니라 안내 메시지로 응답
```json
{
  "session_id": null,
  "reply": "전문가와 대화하려면 로그인이 필요합니다."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 403 | FORBIDDEN | 본인 세션이 아님 |
| 404 | SKILL_NOT_FOUND | 존재하지 않는 스킬 |
| 404 | SESSION_NOT_FOUND | 존재하지 않는 세션 |

---

### 6-9. 대화 기록 조회

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/chat/{skill_id}/{session_id}` |
| 설명 | 세션의 전체 대화 기록을 반환한다. |
| 인증 | Access Token 필요 (6-7/6-8과 달리 비로그인 시 안내 메시지가 아니라 401 에러) |

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

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 세션이 아님 |
| 404 | SESSION_NOT_FOUND | 존재하지 않는 세션 |

---

### 6-10. 스킬 생성 시작

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills/create` |
| 설명 | 카테고리를 선택해 5단계 파이프라인을 시작한다. `what_skill` 단계의 고정 시작 문구가 곧바로 반환된다. |
| 인증 | Access Token 필요 |
| Content-Type | `multipart/form-data` |

**Request Body (Form)**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| category | string | ✅ | 사용자가 고른 카테고리 (예: 인테리어) |

**응답 (200 OK)**
```json
{
  "draft_id": "uuid",
  "stage": "what_skill",
  "messages": ["안녕하세요! 인테리어의 스킬 만들기를 시작할게요!\n\n..."],
  "skill_info": { "category": "인테리어" }
}
```

`messages`는 이번 호출로 새로 생긴 AI 메시지 배열이다(보통 1개 — 한 단계가 스스로 LLM을 여러 번 부르는 경우(`skill_test`)만 예외). `skill_info`는 지금까지 누적된 전체 상태(`skill_info.schema.json` 구조)를 매번 통째로 반환한다.

---

### 6-11. 스킬 생성 이어가기

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills/create/{draft_id}` |
| 설명 | 현재 `stage`의 노드에 메시지/링크/파일을 보낸다. 완료 조건을 채우면(tool_call 발생) 응답의 `stage`가 다음 단계로 바뀐다 — 단, 그 다음 단계 자체를 진행시키려면 클라이언트가 이 엔드포인트를 다시 호출해야 한다(자동으로 이어지지 않음). |
| 인증 | Access Token 필요 (본인만) |
| Content-Type | `multipart/form-data` |

**Request Body (Form)**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| message | string | ❌ | 채팅 메시지 |
| links | string[] | ❌ | 참고 URL (서버가 크롤링) |
| files | file[] | ❌ | 참고 문서 (pdf/docx/txt/md) |

message/links/files가 전부 비어있으면 422. 응답 형식은 6-10과 동일(`CreationResponse`).

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 draft가 아님 |
| 404 | DRAFT_NOT_FOUND | 존재하지 않는 draft |
| 422 | EMPTY_REQUEST | message/links/files가 전부 비어있음 |

---

### 6-12. 개선 / 재테스트

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills/create/{draft_id}/improve` |
| 설명 | `skill_test` 결과를 보고 사용자가 "개선할게요"를 선택했을 때. `stage`가 `skill_improve`로 바뀌고 그 시작 문구가 반환된다. |
| 인증 | Access Token 필요 (본인만) |

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills/create/{draft_id}/retest` |
| 설명 | `skill_improve` 이후 사용자가 "다시 테스트"를 선택했을 때. `stage`가 `skill_test`로 바뀐다. |
| 인증 | Access Token 필요 (본인만) |

**에러 응답 (둘 다 공통)**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 draft가 아님 |
| 404 | DRAFT_NOT_FOUND | 존재하지 않는 draft |
| 409 | NOT_READY_TO_IMPROVE / NOT_READY_TO_RETEST | 현재 stage에서 호출할 수 없는 전환 |

---

### 6-13. 진행 상황 조회 / 확정

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/skills/create/{draft_id}` |
| 설명 | 현재 `stage`와 누적된 `skill_info`를 반환한다(`messages`는 빈 배열). |
| 인증 | Access Token 필요 (본인만) |

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/skills/create/{draft_id}/confirm` |
| 설명 | `skill_info.name`과 `skill_info.content`가 채워진 draft를 실제 `Skill`로 등록한다. `content`는 `render_md_content()`로 하나의 마크다운 시스템 프롬프트로 조립된다. |
| 인증 | Access Token 필요 (본인만) |

**응답 (201 Created)** — 기존 `POST /skills`와 동일한 `SkillSummary`. `category`는 draft 시작 시 골랐던 값이 그대로 옮겨진다.
```json
{ "id": "uuid", "user_id": "uuid", "title": "6평 원룸 가구 배치 가이드", "description": "...", "category": "인테리어", "created_at": "2026-07-18T00:00:00Z" }
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 400 | DRAFT_NOT_READY | `skill_info.name` 또는 `content`가 아직 없음 |
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |
| 403 | FORBIDDEN | 본인 draft가 아님 |
| 404 | DRAFT_NOT_FOUND | 존재하지 않는 draft |

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
| category | VARCHAR(50) | 카테고리(자유 텍스트, "기타" 커스텀 입력 포함 — 정규화 테이블 없음) |
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

### skill_drafts
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK, 자동 생성 |
| user_id | UUID | 생성을 시작한 사용자 |
| thread_id | VARCHAR | 생성 에이전트의 LangGraph Checkpointer thread ID |
| stage | VARCHAR | `what_skill` \| `skill_content` \| `skill_name` \| `skill_test` \| `skill_improve` |
| skill_info | JSONB | `skill_info.schema.json` 구조로 누적되는 단일 객체 (category/topic/definition/target/content/name/testReport) |
| created_at | TIMESTAMP | 생성 시작일 |
| updated_at | TIMESTAMP | 수정일 |

> `title`/`description`/`md_content`를 별도 컬럼으로 두지 않는다 — 프롬프트 엔지니어가 `skill_info.schema.json`에 필드를 추가/변경해도 DB 마이그레이션이 필요 없도록, 진행 중 상태는 `skill_info` 하나로만 관리한다.

---

## 8. 비즈니스 규칙

- 사용자는 스킬을 여러 개 등록할 수 있다.
- 스킬 삭제 시 해당 스킬의 모든 chat_sessions를 함께 삭제한다.
- 비로그인 사용자는 스킬 목록/조회/다운로드는 가능하나 대화는 불가능하다.
- 비로그인 대화 요청 시 LLM을 호출하지 않고 안내 메시지를 즉시 반환한다.
- 대화 세션은 본인만 접근 가능하다.
- `thread_id`는 `session_id`와 동일한 값을 사용한다.
- 스킬 생성은 로그인한 사용자만 시작할 수 있다.
- `skill_test`(실제 이중 실행 채점)와 `skill_improve`(재인터뷰) 결과는 그대로 사용자에게 노출된다 — 옛 설계(self_test/critique)와 달리 내부에 숨기지 않는다. 다음 행동(개선/재테스트/확정)은 사용자가 직접 고른다.
- draft는 `confirm` 호출 전까지 실제 `skills` 테이블에 반영되지 않는다.
- draft는 본인만 조회/이어가기/확정할 수 있다.
- 스킬 수정/삭제는 소유자만 가능하지만, **사용(대화)은 소유자 여부와 무관하게 로그인한 모든 사용자에게 열려 있다.** 여러 사용자가 같은 스킬로 동시에 대화해도 `thread_id`가 사용자/세션마다 독립적으로 발급되므로 대화 상태가 섞이지 않는다.

---

## 9. 아직 구현되지 않은 범위 (2026-07-18 기준)

- **스킬 공개 검색/발견(discovery)**: 지금은 `GET /skills`로 전체 목록을 가져오거나 `user_id`로 필터링하는 것만 가능하고, 태그/키워드 검색, 추천, 팔로우 기반 피드는 없다. 이 기능은 skill-service 범위가 아니라 아직 미구현 상태인 **feed-service**에서 다룰 예정.
- **실제(프로덕션) 프론트엔드 연동**: `/skills/create/*`는 아직 어떤 프론트엔드와도 안 붙어있고, CORS 설정도 안 돼 있다. 요청/응답 형태, 인증 흐름 등이 바뀔 수 있다.
- **`skill_test`/`skill_improve` 루프, 확정(confirm)**: `what_skill → skill_content → skill_name` 전환까지는 실제 서버로 검증했지만, `skill_test`의 실제 이중 실행 채점과 `skill_improve` 재인터뷰, `/confirm`은 아직 라이브로 검증되지 않았다.
- **feed-service 자체**: `docker-compose.yml`에 서비스로 등록돼 있지 않고 `Dockerfile`만 존재, 코드 미구현.

---

## 10. 테스트 프론트엔드 (`test_frontend/`)

각 서비스(`user-service`, `skill-service`)가 FastAPI `StaticFiles`로 루트(`/`)에 정적 HTML 하나를 서빙해 수동 기능 테스트를 지원한다 (배포 전 삭제 예정, `main.py`에 삭제 방법 주석 있음).

`skill-service/test_frontend/index.html`에서 스킬 직접 등록(`POST /skills`), 목록/상세/수정/삭제, 스킬 에이전트와의 대화(`POST /chat/*`)를 테스트할 수 있다. ("AI로 스킬 만들기" 카드는 옛 `/skills/draft` 설계 전용이라 그 설계와 함께 제거됨 — 새 5단계 파이프라인(`/skills/create/*`)은 아직 이 페이지에 없고 `/docs`의 Swagger로 테스트한다.)
