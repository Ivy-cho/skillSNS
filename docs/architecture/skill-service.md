# skill-service — 기술 설계

- **포트**: 8002 (로컬은 `python run.py`, Windows에서 `uvicorn` 직접 실행 시 psycopg 이벤트 루프 문제)
- **책임**: 스킬 CRUD / 게시된 스킬과의 대화 / 5단계 스킬 생성 파이프라인(LangGraph) /
  카테고리명 Agent / 스크랩(폴더) / BYOK(사용자 Anthropic 키)
- **소유 테이블**: `skills`, `categories`, `chat_sessions`, `skill_drafts`,
  `scrap_folders`, `scraps`, `user_secrets` + LangGraph 체크포인터 테이블
- **API 계약(요청/응답 전문)**: [`../specs/skill-service.md`](../specs/skill-service.md)

가장 무거운 서비스다. 이 문서는 (1) SW 구조 → (2) DB 설계 → (3) **한 프롬프트에서
여러 대화창을 따로 만드는 구조** → (4) 스킬 생성 파이프라인 → (5) 카테고리명 Agent →
(6) BYOK 순으로 설명한다.

---

## 1. SW 구조

```
skill-service/
├── main.py             # FastAPI 앱. lifespan에서 ① 테이블/컬럼 준비 ② LangGraph 체크포인터 풀 생성
├── run.py              # Windows용 진입점 (SelectorEventLoop 강제 후 uvicorn 기동)
├── Dockerfile          # python:3.11-slim, uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002}
└── app/
    ├── core/
    │   ├── config.py       # Settings: DATABASE_URL, JWT_*, ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
    │   │                    #           SECRET_ENCRYPTION_KEY, CORS_ORIGINS, CHECKPOINTER_URL(파생)
    │   ├── security.py      # decode_token (검증만 — 발급은 user-service 담당)
    │   └── crypto.py        # Fernet encrypt_secret / decrypt_secret (복호화 실패 시 None)
    ├── db/database.py       # async engine(NullPool) + get_db + Base
    ├── models/             # SQLAlchemy 모델: skill.py(Skill/ChatSession/SkillDraft), category.py,
    │                        #                  scrap.py(ScrapFolder/Scrap), user_secret.py
    ├── schemas/            # Pydantic I/O 모델 (skill / scrap / creation / user_secret)
    ├── services/
    │   ├── categories.py    # 택소노미 조회·표시 해석·upsert·"미분류" 폴백
    │   ├── user_secrets.py  # resolve_llm_key / require_llm_key (BYOK + 무료 체험 카운트)
    │   └── ingest.py        # URL/파일(PDF·DOCX·TXT·MD) → 텍스트 추출 (스킬 생성 입력 보강)
    ├── agent/
    │   ├── graph.py             # build_agent(): 게시된 스킬과 대화하는 1노드 그래프 + 오프닝 턴 지침
    │   ├── category_classifier.py  # classify_category(): 일회성 분류 Agent (tool-call 강제)
    │   └── creator/             # 스킬 생성 파이프라인 (아래 4절)
    │       ├── graph.py         #   build_creator_graph(): stage → 노드 라우팅
    │       ├── state.py         #   CreatorState (skill_info / stage / turn_messages / choices / summary)
    │       ├── stage_runner.py  #   what_skill·skill_content·skill_improve 공용 실행기
    │       ├── name_node.py     #   skill_name 전용 노드 (choices/summary 필요)
    │       ├── test_node.py     #   skill_test 전용 노드 (스킬 vs baseline 2단 오케스트레이션)
    │       ├── merges.py        #   각 단계가 skill_info의 어느 필드를 채우는지
    │       ├── outputs.py       #   단계별 tool 출력 스키마 (Pydantic)
    │       ├── loader.py        #   프롬프트 .md의 {변수} → skill_info 필드 치환
    │       └── render.py        #   skill_info → 최종 시스템 프롬프트 마크다운
    ├── prompts/skill_creation/  # 01~06 .md 프롬프트 + schemas/*.schema.json (프롬프트 엔지니어 영역)
    └── api/routes/
        ├── skills.py          # /skills  CRUD + 다운로드 + 백그라운드 카테고리 분류
        ├── chat.py            # /chat    대화 시작/이어가기/이력/최근/세션목록
        ├── skill_creation.py  # /skills/create/*  생성 파이프라인 오케스트레이션
        ├── scrap.py           # /scrap   폴더 + 담기/빼기
        └── user_secrets.py    # /me/anthropic-key  BYOK 키 등록/조회/삭제
```

### 인증

user-service가 발급한 access JWT를 `decode_token`으로 **검증만** 한다
(`JWT_SECRET_KEY` 공유). 대부분의 라우트는 `HTTPBearer` + `payload["sub"]`로 user_id를
얻고, `/chat/*`는 `HTTPBearer(auto_error=False)`라 토큰이 없으면 401 대신
"로그인이 필요합니다" 안내 문구를 정상 응답(200)으로 돌려준다 —
**500 응답엔 CORS 헤더가 안 붙어 브라우저에 `failed to fetch`로 보이기 때문**에,
이 서비스는 전반적으로 "에러를 200 + 안내 문구로 흡수"하는 방침을 쓴다.

### 요청 처리 흐름 (대화 예시)

```
POST /chat/{skill_id}/{session_id}  { message }
  → decode_token → user_id
  → SELECT skills WHERE id = skill_id          (md_content = 시스템 프롬프트)
  → SELECT chat_sessions WHERE id = session_id (thread_id, 소유자 검증)
  → resolve_llm_key(user_id)                   (BYOK / 무료 체험 → api_key)
  → agent = build_agent(md_content, app.state.checkpointer, api_key)
  → agent.ainvoke({messages:[Human]}, {configurable:{thread_id}})
        LangGraph가 thread_id로 이전 메시지를 복원 → LLM 호출 → 새 메시지 저장
  → chat_sessions.updated_at = now()           (채팅 목록 정렬용)
  → { session_id, reply }
```

---

## 2. DB 설계

`categories`/`scrap_folders`/`scraps` 사이에만 실제 FK가 있고,
`*.user_id`는 user-service의 `users.id`를 값으로만 참조한다(FK 없음).

### `skills`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | String (UUID) | PK |
| `user_id` | String | `users.id` 값 참조 (FK 없음) |
| `title` | String(200) | |
| `description` | Text | NULL 허용 (한 줄 정의) |
| `md_content` | Text | NOT NULL. **게시된 스킬의 시스템 프롬프트 그 자체** — 대화 에이전트가 이걸 그대로 씀 |
| `category` | String(50) | NOT NULL, `FOREIGN KEY → categories.id` (소분류 행). 표시 이름·이모지는 조인해서 해석 |
| `view_count` | Integer | 상세 조회(`GET /skills/{id}`)마다 +1. Core `update()`로만 건드려 `updated_at`이 안 바뀌게 함 |
| `created_at` / `updated_at` | DateTime(tz) | |

### `categories` — 카테고리 택소노미

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | String (UUID) | PK |
| `name` | String(50) | NOT NULL |
| `emoji` | String(16) | NOT NULL, 기본 `🏷️`. 홈/피드/채팅목록 아바타에 표시 |
| `parent_id` | String | `FOREIGN KEY → categories.id (ON DELETE CASCADE)`. **NULL이면 대분류, 값이 있으면 그 대분류의 소분류** (자기참조 트리, 2단계 고정) |
| `created_at` | DateTime(tz) | |

부분 유니크 인덱스로 이름 난립을 막는다(Postgres는 UNIQUE에서 NULL을 서로 다르게 봄):
- `uq_category_major_name`: `parent_id IS NULL`인 행에서 `name` 전역 유일
- `uq_category_sub_name`: `parent_id IS NOT NULL`인 행에서 `(parent_id, name)` 유일

### `chat_sessions` — 대화 세션 메타 (실제 메시지는 없음)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | String (UUID) | PK. API에서 `session_id`로 노출 |
| `user_id` | String | 세션 소유자 |
| `skill_id` | String | `FOREIGN KEY → skills.id (ON DELETE CASCADE)` |
| `thread_id` | String | NOT NULL. **LangGraph 체크포인터의 대화 스레드 키** (여기가 핵심 — 3절) |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | 메시지가 오갈 때마다 라우트에서 갱신. 채팅 목록을 "최근 대화순"으로 정렬하는 기준 |

메시지 본문은 이 테이블에 **없다**. `thread_id`로 LangGraph 체크포인터를 조회해서 꺼낸다.

### `skill_drafts` — 스킬 생성 진행 상태

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | String (UUID) | PK. API에서 `draft_id` |
| `user_id` | String | |
| `thread_id` | String | 생성 대화용 LangGraph 스레드 키 (revert 시 새로 발급) |
| `stage` | String | `what_skill` / `skill_content` / `skill_name` / `skill_test` / `skill_improve` |
| `skill_info` | JSONB | **단계별 결과가 누적되는 단일 객체** (`prompts/skill_creation/schemas/skill_info.schema.json` 모양). 옛 `status/title/description/md_content` 컬럼은 제거됨 |
| `confirmed_at` | DateTime(tz) | `confirm()` 시각. 채워지면 더 이상 revert 불가 |
| `created_at` / `updated_at` | DateTime(tz) | |

### `scrap_folders` / `scraps`

| 테이블 | 컬럼 | 비고 |
|---|---|---|
| `scrap_folders` | `id` PK, `user_id`, `name` String(30), `created_at` | |
| `scraps` | `id` PK, `user_id`, `skill_id` FK→skills(CASCADE), `folder_id` FK→scrap_folders(CASCADE), `added_at` | `UNIQUE(user_id, skill_id)` — **한 유저가 같은 스킬을 두 폴더에 못 담음. 다시 담으면 폴더 이동** |

### `user_secrets` — BYOK

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id` | String | **PK** (유저당 1행) |
| `anthropic_api_key_encrypted` | Text | NULL 허용. Fernet 암호문. 평문은 DB에도 로그에도 안 남고 API로도 안 내려감 |
| `free_turns_used` | Integer | 본인 키 없는 유저의 서버 기본 키 사용 횟수(생성·대화 합산). `FREE_TRIAL_LIMIT = 3` |
| `updated_at` | DateTime(tz) | |

### 마이그레이션

`main.py` lifespan에서 `create_all` 후 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로
`chat_sessions.updated_at`, `skills.view_count`, `skill_drafts.confirmed_at`,
`user_secrets.free_turns_used`를 얹는다.

### LangGraph 체크포인터 테이블

`langgraph-checkpoint-postgres`의 `AsyncPostgresSaver`가 **자동 생성·관리**한다
(`checkpoints`, `checkpoint_writes`, `checkpoint_blobs` 등). 대화/생성 메시지 이력의
**본문**이 여기 저장되고, `thread_id`로 `chat_sessions` / `skill_drafts`와 연결된다.
스키마는 우리가 정의하지 않는다.

---

## 3. ⭐ 한 스킬(프롬프트)에서 여러 대화창을 따로 만드는 구조

이 서비스의 기술적 핵심. **스킬(시스템 프롬프트)은 하나인데, 그것과의 대화는
독립적으로 여러 개**를 만들 수 있고, 각 대화는 나갔다 들어와도 자기 맥락만 이어진다.

### 3.1 데이터 모델: 1 skill : N chat_sessions

```
skills (1)
  id, md_content(=시스템 프롬프트)
        │
        │  1:N
        ▼
chat_sessions (N)          LangGraph 체크포인터 (thread_id 로 파티션)
  id (session_id)  ───┐    ┌─ thread "abc" : [Human, AI, Human, AI, ...]
  skill_id            │    │
  thread_id  ─────────┼───▶├─ thread "def" : [Human, AI, ...]
  user_id             │    │
  updated_at          │    └─ thread "ghi" : [Human, AI, ...]
```

- 같은 `skill_id`에 대해 `POST /chat/{skill_id}`를 부를 때마다 **새 `chat_sessions` 행 +
  새 `thread_id`(uuid4)** 가 만들어진다. 한 스킬에 대화 N개가 나란히 존재할 수 있다.
- 대화의 실제 메시지 히스토리는 `chat_sessions`가 아니라 **LangGraph 체크포인터**에
  들어가고, `thread_id`가 그 파티션 키다. 세션끼리 히스토리가 절대 안 섞인다.
- `chat_sessions`는 "이 대화가 어느 스킬/유저의 것이고 언제 마지막으로 썼는가"라는
  **메타데이터만** 들고 있다.

### 3.2 에이전트는 상태를 안 들고 있다 — 매 요청 새로 조립

`app/agent/graph.py`의 `build_agent()`는 **요청마다 새로 호출**된다:

```python
def build_agent(md_content, checkpointer, api_key=None, opening=False):
    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, **({"api_key": api_key} if api_key else {}))
    async def call_model(state):
        system = SystemMessage(content=f"당신은 다음 전문 지식을 가진 전문가입니다...\n\n{md_content}"
                                       + (OPENING_INSTRUCTIONS if opening else ""))
        return {"messages": [await llm.ainvoke([system] + state["messages"])]}
    builder = StateGraph(MessagesState)
    builder.add_node("agent", call_model)
    builder.add_edge(START, "agent"); builder.add_edge("agent", END)
    return builder.compile(checkpointer=checkpointer)
```

그래프 자체는 **1노드(START → agent → END)** 로 단순하다. 대화의 "기억"은 그래프가
아니라 `checkpointer`가 담당한다. 그래서:

- 서버는 세션별 에이전트 객체를 메모리에 들고 있을 필요가 없다(수평 확장·재시작에 안전).
- 대화를 이어가려면 **같은 `checkpointer` + 같은 `thread_id`** 만 있으면 된다.
  `agent.ainvoke({"messages": [HumanMessage(...)]}, {"configurable": {"thread_id": tid}})`
  → LangGraph가 `tid`의 이전 상태를 로드해 `state["messages"]` 앞에 이어붙이고,
  LLM 호출 뒤 새 메시지를 그 스레드에 append 한다. 요청은 이번 사용자 발화 1개만 보낸다.
- `md_content`(시스템 프롬프트)는 매 턴 `call_model` 안에서 새로 주입된다. 히스토리에
  저장되지 않으므로, 스킬을 수정하면 **기존 대화도 다음 턴부터 새 프롬프트로 응답**한다.

### 3.3 체크포인터 = DB 커넥션 풀 (main.py lifespan)

```python
async with AsyncConnectionPool(
    conninfo=settings.CHECKPOINTER_URL,          # DATABASE_URL 에서 +asyncpg 제거한 psycopg DSN
    max_size=20,
    kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    check=AsyncConnectionPool.check_connection,   # 체크아웃마다 커넥션 생존 확인
) as pool:
    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()                    # 체크포인터 테이블 생성/마이그레이션
    app.state.checkpointer = checkpointer
```

`AsyncPostgresSaver.from_conn_string()`은 커넥션 하나를 앱 수명 내내 물고 있어서
Supabase 유휴 타임아웃에 끊기면 **재연결 없이 계속 에러**를 낸다. 그래서 풀을 직접 만들고
`check=check_connection`으로 죽은 커넥션을 자동 회수·재생성하게 한다. 모든 대화 라우트는
`request.app.state.checkpointer`를 공유한다.

### 3.4 세 가지 읽기 경로

| 엔드포인트 | 용도 | 방식 |
|---|---|---|
| `GET /chat/{skill_id}/{session_id}` | 특정 대화 이력 전체 | `agent.aget_state(config)` → `state.values["messages"]`를 role별로 변환 |
| `GET /chat/{skill_id}/latest` | 채팅창 진입 시 "가장 최근 대화 이어보기" | `chat_sessions`에서 `updated_at DESC LIMIT 1` → 위와 동일. 없으면 `null` |
| `GET /chat/sessions` | 채팅 목록 화면 ("내가 대화한 스킬들") | `chat_sessions ⨝ skills`를 `updated_at DESC`로, 각 스레드의 마지막 메시지 1개만 `aget_state`로 미리보기 |

읽기 전용 호출은 `build_agent("", checkpointer)`처럼 `md_content`·`api_key` 없이 만든다
(LLM을 안 부르고 상태만 조회).

### 3.5 오프닝 턴

`POST /chat/{skill_id}`에서 `message`가 비어 있으면(채팅창을 막 연 시점) **오프닝 턴**:
`build_agent(..., opening=True)`가 시스템 프롬프트에 "지금은 첫 턴이다, 스스로 소개하고
첫 질문을 던져라"는 지침(`OPENING_INSTRUCTIONS`)을 덧붙인다. LLM은 사람 발화가 있어야
답하는 구조라 `"(대화 시작)"` 더미 메시지를 넣는다(프론트가 이력에서 걷어냄).
오프닝 턴은 **서버 기본 키로 처리**되어 무료 횟수·본인 키를 소모하지 않는다 —
실제 소모는 사용자가 첫 메시지를 보내는 순간부터.

---

## 4. 스킬 생성 파이프라인 (`app/agent/creator/`)

### 4.1 원칙: 호출 하나 = 단계 하나

5단계(`what_skill → skill_content → skill_name → skill_test → skill_improve`)를 한
요청에 자동으로 묶지 않는다. 각 API 호출이 정확히 한 단계만 처리하고 끝나며, 다음
단계로 갈지는 **클라이언트가 다음 요청을 언제 보내느냐**로 결정한다. 중간에 실패해도
"어디까지 반영됐는지"가 `skill_drafts.stage` / `skill_info`에 항상 명확히 남는다.

### 4.2 그래프 라우팅

```
LangGraph는 매 invoke를 항상 START부터 실행한다.
  START ──(route_by_current_stage: state["stage"] 값을 그대로 반환)──▶ 해당 stage 노드 ──▶ END
```

`build_creator_graph(checkpointer, api_key)`가 `skill_drafts.thread_id`로 대화를
이어가고, `route_by_current_stage`가 없으면 매번 1단계부터 다시 돌게 된다.

| stage | 노드 구현 | tool 출력 스키마 | `skill_info`에 채우는 필드 |
|---|---|---|---|
| `what_skill` | `stage_runner` 공용 | `WhatSkillOutput` | `topic`, `definition`, `target` |
| `skill_content` | `stage_runner` 공용 | `SkillContentOutput` | `content.{procedure,rules,checklist,cases,knowhow,safety,tone}` |
| `skill_name` | `name_node` (전용) | `NameTurn` (reply/done/choices/summary/name) | `name` |
| `skill_test` | `test_node` (전용) | `SkillTestOutput` | `testReport` |
| `skill_improve` | `stage_runner` 공용 | `SkillImproveOutput` | `content.*` (보완분 덮어쓰기) |

- **`stage_runner`(공용)**: 프롬프트 로드 → `llm.bind_tools([output_model])` 호출 →
  tool_call이 있으면 `merge()`로 `skill_info` 갱신 + `stage`를 다음으로 전진, 없으면
  평범한 대화 턴으로 텍스트만 반환. (Anthropic이 `tool_use` 뒤에 `tool_result`를
  요구하므로 더미 `ToolMessage("ok")`를 붙인다.)
- **`name_node`(전용)**: 이름 후보(`choices`)를 확정 전에도 카드로 보여줘야 해서 매 턴
  `NameTurn` tool로 응답하게 한다.
- **`test_node`(전용)**: "실제로 돌려본다"가 LLM 1회 호출이 아니라 —
  ① 확정된 샘플 질문마다 **임시 스킬 에이전트**(`build_agent(md_content, MemorySaver())`)와
  **baseline 에이전트**(스킬 없는 일반 어시스턴트)를 나란히 실행 →
  ② 응답 시간·토큰 실측 →
  ③ 두 결과 transcript를 다시 LLM에게 넘겨 `test_report` 형식으로 채점.
  2단 오케스트레이션이라 공용 실행기로 못 만든다.

### 4.3 프롬프트 ↔ 코드 경계

- 프롬프트는 `app/prompts/skill_creation/01~06.md` (프롬프트 엔지니어 영역).
- `.md` 안의 `{한 줄 정의}` 같은 변수는 `creator/loader.py`의 `VARIABLE_MAP`이
  `skill_info` 필드로 치환한다. 새 변수를 쓰려면 이 맵에 한 줄만 추가.
- 확정 시 `creator/render.py`의 `render_md_content(skill_info)`가 구조화된
  `skill_info`를 **실제 대화 에이전트가 쓸 하나의 마크다운 시스템 프롬프트**로 조립해서
  `skills.md_content`에 저장한다.

### 4.4 이어가기 입력 보강 (`services/ingest.py`)

`POST /skills/create/{draft_id}`는 텍스트 메시지 + `links[]` + `files[]`를 받는다.
`_combine_sources()`가 URL은 `trafilatura`(또는 PDF면 `pypdf`)로, 파일은 확장자별로
(`pdf`/`docx`/`txt`/`md`) 텍스트 추출해서(각 20k자, 5MB 제한) `"---"`로 이어붙여 한
사용자 메시지로 만든다.

### 4.5 revert (`POST /skills/create/{draft_id}/revert`)

되돌릴 stage 이후로 각 단계가 채운 필드를 `skill_info`에서 폐기하고
(`_skill_info_before_stage`), `skill_name` 이하로 가면 `category`도 함께 폐기,
**새 `thread_id`로 대화를 아예 새로 시작**한다(이후 단계 대화가 새 stage 프롬프트와
어긋나지 않도록). `confirmed_at`이 있으면 409.

---

## 5. 카테고리명 Agent (`app/agent/category_classifier.py`)

사용자가 카테고리를 고르는 단계는 없앴다. `classify_category(material, api_key, db, ...)`가
스킬 내용 텍스트를 보고 **대분류/소분류를 정해 `categories`에 upsert하고 소분류 id를
반환**하는 일회성 호출이다(사용자와 대화하지 않음).

```
get_taxonomy_tree(db)  →  현재 대/소분류 트리를 텍스트로
06-category.md (재사용 우선 지침) + 스킬 내용
  → llm.bind_tools([CategoryDecision], tool_choice="CategoryDecision")   # 강제 tool-call
  → { major_name, major_emoji, sub_name, sub_emoji, ... }
  → upsert_category(): 이름으로 대분류 조회→없으면 생성, 소분류 조회→없으면 생성
                       (LLM이 "신규"라 해도 이름으로 재조회해 중복 방지)
  → 소분류 id 반환
```

호출 지점(모두 best-effort — 실패해도 스킬은 저장된다):

| 경로 | 시점 | 실패 시 |
|---|---|---|
| `POST /skills/create/{id}` | `skill_name` 확정 턴(`skill_name → skill_test`)에서 | 롤백 후 confirm에서 재시도 |
| `POST /skills/create/{id}/confirm` | `skill_info.category`가 아직 비어 있으면 | `get_fallback_category_id()` → **"미분류"** 소분류로 저장 |
| `POST /skills` ("내 스킬 넣기") | 응답을 먼저 보내고 **`BackgroundTasks`로 분류** → `skills.category` 갱신 | 이미 "미분류"로 저장돼 있어 유실 없음 |

표시용 해석은 `services/categories.py`의 `get_display_map` / `resolve_display`가
담당한다(id → `(이름, 이모지)`, 못 찾으면 원본값 + 기본 이모지로 폴백 — 백필 전 라벨 대비).

---

## 6. BYOK + 무료 체험 (`app/core/crypto.py`, `app/services/user_secrets.py`)

- **저장**: `PUT /me/anthropic-key` → `encrypt_secret()`(Fernet, `SECRET_ENCRYPTION_KEY`) →
  `user_secrets.anthropic_api_key_encrypted`. `GET`은 `{ has_key }`만, 평문은 절대 안 내려감.
- **사용**: 대화·생성·분류는 호출 직전에 키를 해결한다.
  - `resolve_llm_key(user_id, db)`: 본인 키 있으면 그걸(카운트 안 건드림), 없으면
    `free_turns_used < 3`인 동안 서버 기본 키(`ANTHROPIC_API_KEY`)를 내주고 카운트 +1,
    한도 초과면 `None`.
  - `require_llm_key()`: 위와 같되 `None`이면 `400 ANTHROPIC_KEY_REQUIRED`
    (스킬 생성·분류처럼 첫 호출부터 LLM이 필수라 "안내만 반환"할 여지가 없는 경로).
  - 복호화 실패(`decrypt_secret` → `None`)는 예외로 안 죽고 "키 없음 → 무료 체험"으로 폴백.
- **카운트 소모 시점**: 항상 "실제로 LLM을 부르기 직전". 검증에서 실패할 요청까지
  무료 횟수를 깎지 않는다.

---

## 7. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://...`. `CHECKPOINTER_URL`은 여기서 `+asyncpg`를 뗀 psycopg DSN으로 파생 |
| `JWT_SECRET_KEY` | ✅ | **user-service와 동일해야** 토큰 검증 가능 |
| `ANTHROPIC_API_KEY` | ✅ | 서버 기본 키 (무료 체험·오프닝 턴 전용) |
| `ANTHROPIC_MODEL` | | 기본 `claude-sonnet-4-6` |
| `SECRET_ENCRYPTION_KEY` | ✅ | Fernet 키(`Fernet.generate_key()`). 새면 저장된 모든 사용자 키가 복호화 가능 — `.env`에만 |
| `CORS_ORIGINS` | | 쉼표 구분. 기본 `http://localhost:3000` |

---

## 8. 배포

Render `env: docker`. `branch: develop`, `autoDeploy: false`. 컨테이너는
`uvicorn main:app --host 0.0.0.0 --port ${PORT}`. 파이프라인은
[`../tech-decisions.md`](../tech-decisions.md) 9절.
