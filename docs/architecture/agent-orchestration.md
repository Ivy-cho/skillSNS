# 에이전트 오케스트레이션 관점의 skillSNS

이 프로젝트를 "에이전트 오케스트레이터" 구조로 다시 읽은 문서다. 서비스별 구조는
[skill-service.md](skill-service.md) 등에 있고, 여기서는 **여러 LLM 호출을 어떤 규칙으로
엮어 하나의 결과를 만드는가**만 본다.

- 전제: 프레임워크(CrewAI·AutoGen 같은 멀티에이전트 런타임)를 쓰지 않는다.
  오케스트레이션은 **FastAPI 라우트 핸들러 + LangGraph `StateGraph` + 외부화된 프롬프트
  파일**로 직접 짜여 있다. `tech-decisions.md` 7절 참고 — Anthropic Agent Skills API 대신
  기존 스택(`langchain-anthropic`/`langgraph`)으로 자체 구현하기로 한 결정.
- 핵심 관련 코드: `skill-service/app/agent/` 전체, `skill-service/app/api/routes/skill_creation.py`,
  `skill-service/app/api/routes/chat.py`, `skill-service/app/prompts/skill_creation/`.

---

## 1. "오케스트레이션"이 여기서 뜻하는 것

세 종류의 LLM 작업이 있고, 각각 엮는 방식이 다르다.

| 작업 | 엮는 주체 | 모양 |
|---|---|---|
| **스킬 생성** (노하우 → 시스템 프롬프트) | LangGraph 슈퍼그래프 + 라우트 | 5단계, 단계마다 노드 1개, "호출 하나 = 단계 하나" |
| **스킬 테스트** (생성 4단계 안에서) | `test_node`가 자체 오케스트레이션 | 에이전트 2개(스킬 켠 것 / 끈 것) 대조 실행 → 채점 LLM |
| **카테고리 분류** | 생성 오케스트레이터가 서브에이전트로 호출 | 일회성, 강제 tool-call, 대화 없음 |
| **스킬과 대화** (생성의 산출물) | 라우트 + 1노드 그래프 | 스킬 `md_content`가 곧 시스템 프롬프트 |

"오케스트레이터"라 부를 만한 실체는 두 곳이다:
`skill_creation.py`의 라우트 핸들러(`_invoke`)와, 그것이 만드는 LangGraph
`build_creator_graph()`의 `route_by_current_stage`.

---

## 2. 오케스트레이션 레이어

```
┌──────────────────────────────────────────────────────────────────────┐
│ A. 라우트 레이어 (FastAPI) — "어느 에이전트를, 어떤 키로, 어떻게 실패 처리"  │
│    /skills/create/*   /chat/*   POST /skills (배경 분류)                │
│    · BYOK 키 해결(resolve_llm_key) → api_key 확정                        │
│    · 오류 흡수: 대화는 200+안내 문구 / 생성은 stage 커밋 후 분류 best-effort │
└───────────────┬──────────────────────────────────┬───────────────────┘
                │ 스킬 생성                          │ 스킬과 대화
                ▼                                   ▼
┌──────────────────────────────────┐   ┌───────────────────────────────┐
│ B. 생성 슈퍼그래프 (LangGraph)      │   │  스킬 대화 에이전트 (1노드)      │
│    START ─(route_by_current_stage)─▶ │   │  START → agent → END           │
│    stage 노드 → END                │   │  system = 스킬 md_content       │
│    stage ∈ {what_skill,           │   │  (+ 오프닝 턴이면 지침 덧붙임)   │
│      skill_content, skill_name,    │   │  기억 = checkpointer + thread_id│
│      skill_test, skill_improve}    │   └───────────────────────────────┘
│         │                          │
│         │ skill_test 노드일 때      │
│         ▼                          │
│  ┌─────────────────────────────┐   │
│  │ C. test_node 서브오케스트레이터 │   │
│  │   질문 확정(propose_llm)       │   │
│  │   질문마다:                   │   │
│  │     skill_agent  ┐ 나란히     │   │
│  │     baseline_agent┘ 실행+실측  │   │
│  │   → grade_llm 채점            │   │
│  │   → _ensure_complete_report   │   │
│  └─────────────────────────────┘   │
│         │ skill_name 확정 직후      │
│         ▼                          │
│  ┌─────────────────────────────┐   │
│  │ D. 카테고리명 Agent (서브에이전트)│   │
│  │   taxonomy 트리 주입           │   │
│  │   forced tool-call            │   │
│  │   upsert → 소분류 id           │   │
│  └─────────────────────────────┘   │
└──────────────────────────────────┘
        모든 그래프가 공유 →  LangGraph AsyncPostgresSaver (thread_id로 파티션)
```

---

## 3. 레이어 A — 라우트가 디스패처다

프레임워크의 "오케스트레이터 객체"에 해당하는 게 여기서는 라우트 핸들러다. 하는 일:

1. **어느 에이전트를 부를지 결정** — URL이 곧 분기다.
   `POST /skills/create` → 생성 그래프 진입 / `POST /chat/{id}` → 대화 그래프 /
   `POST /skills` → 저장 후 배경 태스크로 카테고리 분류.
2. **키 오케스트레이션 (BYOK)** — LLM을 부르기 **직전에** `resolve_llm_key(user_id)`로
   본인 키 / 무료 체험 / 없음을 판정해 `api_key`를 확정한다. 그래프·에이전트는 이미
   확정된 키를 받아서 만들어진다(`build_creator_graph(checkpointer, api_key)`).
3. **실패 처리 정책** — 오케스트레이션에서 제일 중요한 부분.
   - 대화(`_invoke_agent`): LLM 예외를 삼키고 안내 문구를 반환한다(500이면 CORS 헤더가
     없어 브라우저에 "failed to fetch"로 보이기 때문).
   - 생성(`_invoke`): **stage 전진을 먼저 커밋**하고(`await db.commit()`), 그 다음
     카테고리 분류를 best-effort로 시도한다. 분류가 실패해도 stage 커밋은 오염되지 않고,
     `confirm` 때 다시 시도한다. → 어느 단계에서 죽어도 "어디까지 됐는지"가 항상 명확.

`skill_creation.py`의 `_invoke()`가 이 레이어의 심장이다:

```
build_creator_graph(checkpointer, api_key)
  → agent.ainvoke({messages, skill_info, stage}, {thread_id})
  → draft.skill_info / draft.stage 갱신 + commit   ← stage 전진 확정
  → (prev_stage == skill_name && now == skill_test) 이면 카테고리명 Agent 호출
        실패 시 rollback + 로그, confirm에서 재시도
  → CreationResponse(turn_messages, choices, summary, ...)
```

---

## 4. 레이어 B — 생성 슈퍼그래프

`skill-service/app/agent/creator/graph.py`.

### 4.1 stage 라우팅 = 오케스트레이션 규칙

LangGraph는 매 `invoke`를 항상 `START`부터 실행한다. `route_by_current_stage`가
`state["stage"]` 값을 **그대로 노드 이름으로** 반환하는 조건부 엣지라, 매 호출이 현재
단계 노드로 바로 진입한다. 이게 없으면 매번 1단계부터 다시 돈다.

```python
builder.add_conditional_edges(START, route_by_current_stage,
                              {name: name for name in all_stage_names})
# 각 stage 노드는 처리 후 무조건 END. 다음 노드로 자동 연결이 없다.
```

### 4.2 "호출 하나 = 단계 하나"

노드가 완료되면 `state["stage"]`를 **다음 단계 이름으로 바꿔 두고 END**로 나간다.
실제로 다음 단계로 넘어가는 것은 **클라이언트가 다음 요청을 보낼 때**다. 여러 단계를
한 요청에 자동으로 묶지 않는 것이 이 오케스트레이터의 핵심 계약이다(중간 실패 시
상태가 항상 또렷하게 남도록).

### 4.3 노드 3종

| 노드 | 만드는 함수 | 특징 |
|---|---|---|
| `what_skill` / `skill_content` / `skill_improve` | `stage_runner.make_stage_node()` (공용) | 프롬프트 로드 → `bind_tools([output_model])` → tool_call 있으면 `merge()`로 `skill_info` 갱신 + stage 전진, 없으면 평범한 대화 턴 |
| `skill_name` | `name_node.make_name_node()` (전용) | 이름 후보(`choices`)·확인(`summary`)·확정(`done`)을 화면에 카드로 보여줘야 해서 **매 턴 `NameTurn` tool로 응답**하게 강제 |
| `skill_test` | `test_node.make_skill_test_node()` (전용) | 아래 5절 — LLM 1회가 아니라 다중 실행 오케스트레이션 |

공용 실행기가 `merge` 함수(`merges.py`)로 "이 단계가 `skill_info`의 어느 필드를 채우는가"만
결정한다. 새 단계를 추가하려면 `STAGES` 표에 한 줄 + 프롬프트 `.md` + `merge` 함수.

### 4.4 상태 (`CreatorState`)

- `skill_info` (JSONB, `skill_drafts` 테이블에 통째 저장) — **단계를 지나며 누적**되는
  단일 객체. `skill_info.schema.json`과 같은 모양.
- `stage` — 지금 어느 노드인지. START가 이걸 보고 진입.
- `turn_messages` / `choices` / `summary` — 누적이 아니라 **이번 턴 값으로 매번 덮어씀**.
  모든 노드가 매 호출마다 이 셋을 반드시 채워 반환한다.

### 4.5 revert

`_skill_info_before_stage()`가 되돌릴 stage 이후 단계가 채운 필드를 `skill_info`에서
버리고(`skill_name` 이하면 `category`도), **새 `thread_id`로** 그 단계를 처음부터
다시 시작한다(이후 대화가 새 stage 프롬프트와 어긋나지 않도록).

---

## 5. 레이어 C — `test_node`: 에이전트 대조 + 채점

`skill_test` 단계의 "실제로 돌려본다"는 LLM 한 번이 아니라 **작은 오케스트레이션**이다.

```
1. propose_llm.ainvoke(...)  → 확정된 샘플 질문 목록 (tool_call)
2. 질문마다:
     skill_agent    = build_agent(md_content, MemorySaver(), api_key)   ← 임시(휘발) 에이전트
     baseline_agent = build_agent(BASELINE_PROMPT, MemorySaver(), api_key)  ← 스킬 없는 대조군
     두 에이전트를 같은 질문으로 실행 → 응답·시간·토큰 실측
3. transcript(질문 + 스킬 켠 답 / 끈 답 + 실측치)를 grade_llm에 넘겨 test_report 형식으로 채점
4. 채점 결과가 불완전하면(benchmark.passRate 등 누락) grade_llm에 1회 재요청
5. _ensure_complete_report(): 그래도 빠진 필드는 실측치·중립값으로 메우고 SkillTestOutput으로 최종 검증
```

- **임시 에이전트**는 `MemorySaver()`(인메모리 체크포인터)로 만든다 — 이 대조 실행은
  대화 이력에 남기면 안 되니까. 배포되는 스킬 대화 에이전트와 코드(`build_agent`)는
  같지만 체크포인터와 시스템 프롬프트가 다르다.
- "스킬을 켰을 때 vs 껐을 때"를 나란히 보여주는 A/B가 이 단계의 신뢰성 근거다
  (`tech-decisions.md` 7절).

---

## 6. 레이어 D — 카테고리명 Agent (호출되는 서브에이전트)

`skill-service/app/agent/category_classifier.py`.

- 생성 오케스트레이터가 **`skill_name` 확정 직후** 호출한다. 사용자와 대화하지 않는
  **일회성** 서브에이전트다.
- 입력: 지금까지의 스킬 내용(`render_md_content(skill_info)`) + 현재 택소노미 트리
  (`get_taxonomy_tree(db)` — 프롬프트에 주입).
- `llm.bind_tools([CategoryDecision], tool_choice="CategoryDecision")` — **강제 tool-call**로
  대/소분류 이름·이모지·신규여부를 받아낸다.
- 출력: `upsert_category()`가 이름으로 재조회해 중복 없이 만들고 **소분류 id** 반환.
  LLM이 "신규"라 해도 이름이 겹치면 기존 것을 재사용한다("재사용 먼저" 원칙).
- **best-effort**: 실패해도 스킬은 "미분류"로 저장된다. "내 스킬 넣기"(`POST /skills`)
  경로에서는 아예 응답을 먼저 보내고 `BackgroundTasks`로 뒤에서 분류한다.

즉 이 서브에이전트는 메인 흐름을 **블록하지 않도록** 오케스트레이션돼 있다.

---

## 7. 산출물 — 스킬 대화 에이전트

생성 파이프라인의 결과물은 **또 다른 에이전트**다. `skill-service/app/agent/graph.py`.

- 그래프는 `START → agent → END` **1노드**. 복잡성은 그래프가 아니라 시스템 프롬프트에 있다.
- 시스템 프롬프트 = 그 스킬의 `md_content`(생성 5단계의 `render_md_content` 결과).
- **요청마다 새로 조립**한다(`build_agent(md_content, checkpointer, api_key)`). 서버가
  세션별 에이전트 객체를 들고 있지 않다 → 재시작·수평 확장에 안전.
- 기억은 그래프가 아니라 **checkpointer + `thread_id`**가 담당. 그래서
  **1 스킬(프롬프트) : N `chat_sessions`(대화)** 가 성립한다 — 자세한 건
  [skill-service.md](skill-service.md) 3절.
- **오프닝 턴**: `message` 없이 진입하면 `opening=True`로 만들어 "스스로 소개하고 첫
  질문을 던져라"는 지침(`OPENING_INSTRUCTIONS`)을 시스템 프롬프트에 덧붙인다.

---

## 8. 프롬프트 오케스트레이션

"Agent 오케스트레이션"과 짝을 이루는 축. 프롬프트를 코드에서 분리해 조립한다.

- **외부화**: 단계별 지시는 `app/prompts/skill_creation/01~06.md`. 프롬프트 엔지니어
  영역이고 코드 배포 없이 고칠 수 있다(`@lru_cache`로 읽고, 서버 재시작 시 반영).
- **템플릿 치환**: `.md` 안의 `{한 줄 정의}` 같은 변수를 `loader.py`의 `VARIABLE_MAP`이
  `skill_info` 필드로 바꾼다. 새 변수를 쓰려면 이 맵에 한 줄 추가.
- **코드측 지침 덧붙이기**: `.md` 원본은 안 건드리고, 연동에 필요한 지침만 코드에서
  이어 붙인다 — `name_node`의 `INTEGRATION_INSTRUCTIONS`(언제 tool을 쓸지),
  대화 그래프의 `OPENING_INSTRUCTIONS`(첫 턴 처리), `test_node`의 재채점 지시
  (`REGRADE_INSTRUCTION`). 프롬프트 문안과 오케스트레이션 계약을 분리하는 패턴.
- **구조화 출력**: 각 단계는 `outputs.py`의 Pydantic 스키마로 `bind_tools` 한다.
  tool_call `args`가 그 단계의 결정이고, `merge` 함수가 `skill_info`에 반영한다.
  (Anthropic이 `tool_use` 뒤 `tool_result`를 요구하므로 더미 `ToolMessage("ok")`를 붙인다.)
- **최종 렌더**: `render.py`가 누적된 `skill_info`를 **하나의 마크다운 시스템 프롬프트**로
  조립 → `skills.md_content`. 생성기의 산출물이 대화 에이전트의 입력이 되는 지점.

---

## 9. 상태·기억

| 무엇 | 어디 | 비고 |
|---|---|---|
| 생성 진행 상태 | `skill_drafts.stage` + `skill_drafts.skill_info`(JSONB) | 슈퍼그래프의 라우팅·누적 상태. 통째로 한 컬럼 |
| 생성 대화 이력 본문 | LangGraph 체크포인터 (`skill_drafts.thread_id`) | AsyncPostgresSaver 자동 관리 |
| 대화 세션 메타 | `chat_sessions` (id/skill_id/thread_id/started_with_opening/updated_at) | 1 스킬 : N 세션 |
| 대화 이력 본문 | LangGraph 체크포인터 (`chat_sessions.thread_id`) | 세션끼리 안 섞임 |
| 체크포인터 커넥션 | `main.py` lifespan의 `AsyncConnectionPool(check=check_connection)` | `app.state.checkpointer`로 모든 그래프가 공유. 죽은 커넥션 자동 회수 |

---

## 10. 설계 판단 정리

| 판단 | 이유 |
|---|---|
| 멀티에이전트 프레임워크 안 씀 | 필요한 건 "채팅 페르소나 프롬프트 문서 하나" — VM 샌드박스·번들 포맷이 목적과 불일치 (`tech-decisions.md` 7절) |
| 호출 하나 = 단계 하나 | 중간 실패 시 "어디까지 반영됐는지"가 항상 명확해야 함. 클라이언트가 진행 속도를 쥠 |
| stage 전진을 카테고리 분류보다 먼저 커밋 | 분류(best-effort)의 실패가 단계 진행을 오염시키지 못하게 격리 |
| 카테고리명 Agent를 서브에이전트로, best-effort | 메인 흐름 블록 금지. 실패해도 "미분류"로 저장. "내 스킬 넣기"는 배경 태스크로 완전 분리 |
| 대화 에이전트를 요청마다 새로 조립(무상태) | 세션 객체를 서버가 안 들고 있음 → 재시작·확장에 안전. 기억은 checkpointer가 담당 |
| 스킬 수정 시 md_content가 히스토리에 안 남음 | 스킬을 고치면 기존 대화도 다음 턴부터 새 프롬프트로 응답 |
| 프롬프트 `.md` 외부화 + 코드측 지침 append 분리 | 프롬프트 문안(엔지니어 영역)과 오케스트레이션 계약(코드)을 따로 관리 |
| test 단계는 인메모리 체크포인터로 임시 에이전트 | 대조 실행이 대화 이력에 남으면 안 됨 |

---

## 11. 여기는 "에이전트"가 아니다 (경계)

오케스트레이션 코드처럼 보이지만 LLM이 관여하지 않는 부분:

- `route_by_current_stage` — 순수 함수(`state["stage"]` 반환). 라우팅 결정에 LLM 없음.
- BYOK 키 해결, 무료 체험 카운트 — DB + 조건문.
- 카테고리 표시 해석(`get_display_map`), 택소노미 트리(`get_taxonomy_tree`),
  `upsert_category` — DB 로직. LLM은 이름/이모지만 제안.
- 피드 정렬·검색·`GET /categories` — SQL.
- base64 WAF 우회 — 전송 계층 처리 (README 11.9).

---

## 12. 코드 지도

```
skill-service/app/
├── api/routes/
│   ├── skill_creation.py   # 레이어 A: _invoke(), stage 전진 커밋, best-effort 분류, revert
│   └── chat.py             # 레이어 A: _invoke_agent() 오류 흡수, 오프닝 턴, 이력 읽기 3경로
├── agent/
│   ├── graph.py            # 산출물: build_agent() 1노드 대화 그래프 + OPENING_INSTRUCTIONS
│   ├── category_classifier.py  # 레이어 D: classify_category() 강제 tool-call 서브에이전트
│   └── creator/
│       ├── graph.py        # 레이어 B: build_creator_graph(), STAGES, route_by_current_stage
│       ├── state.py        # CreatorState (skill_info/stage/turn_messages/choices/summary)
│       ├── stage_runner.py # 공용 노드 실행기 (what_skill/skill_content/skill_improve)
│       ├── name_node.py    # skill_name 전용 노드 + INTEGRATION_INSTRUCTIONS
│       ├── test_node.py    # 레이어 C: 대조 실행 + 채점 + _ensure_complete_report
│       ├── merges.py       # 단계별 skill_info 필드 병합
│       ├── outputs.py      # 단계별 tool 출력 스키마 (Pydantic)
│       ├── loader.py       # 프롬프트 .md 로드 + {변수} → skill_info 치환 (VARIABLE_MAP)
│       └── render.py       # skill_info → 최종 시스템 프롬프트 마크다운
├── prompts/skill_creation/ # 01~06.md (프롬프트 엔지니어 영역) + schemas/*.schema.json
└── main.py                 # 체크포인터 풀 lifespan → app.state.checkpointer (공유)
```
