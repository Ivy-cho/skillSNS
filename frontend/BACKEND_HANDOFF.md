# 백엔드 연동을 위한 현재 상태 메모

이 문서는 API를 이렇게 만들어달라는 스펙이 아니라, **지금 프론트엔드가 어떤 부분을 가짜(mock) 데이터로 흉내내고 있는지** 있는 그대로 정리한 것입니다. 실제 엔드포인트/데이터 구조는 백엔드와 논의해서 정하면 됩니다.

---

## 🤝 백엔드 개발자에게 — 넘기는 것 / 해줄 것 (요약)

핵심: **어려운 부분(워크플로우 md를 프롬프트로 Claude를 굴리는 것)은 이미 작동하는 견본으로 만들어놨습니다.** 백엔드는 그걸 프로덕션에 얹고 + 저장/조회/게시 홈화면만 붙이면 됩니다.

### 프론트에서 넘기는 것
1. **레포 전체** — 스킬 만들기 6단계 UI·흐름 완성 (카테고리→주제→내용→이름→테스트→개선→게시).
2. **데이터 구조** — 모든 단계 데이터가 `workflows/skill_info.json` 스키마 그대로의 객체 하나(`SkillInfo`, `src/components/skill-creator/types.ts`)에 누적됨. 화면은 이 객체만 있으면 그려짐.
3. **작동하는 에이전트 연동 견본** — `src/app/api/agent/[step]/route.ts` 가 `workflows/{step}.md`를 시스템 프롬프트로 **Claude를 실제 호출**함. `@anthropic-ai/sdk` 사용, `submit_turn` tool로 구조화 출력. **Step2(what-skill)는 이미 실제로 대화가 돌아가고**, 나머지 단계도 같은 라우트로 붙는 구조 (프론트가 순차로 연결 중).
4. **계약(contract)** — 아래 형태. 백엔드가 자기 서버로 옮겨도 이 모양만 지키면 프론트는 그대로.
   ```
   POST /api/agent/{step}     // step = what-skill | skill-content | skill-name | skill-test | skill-improve
   요청: { skillInfo, messages: [{ role: "user"|"agent", content }] }
   응답: { reply, skillInfo(채운 필드만), choices: string[]|null, summary: boolean, done: boolean }
   ```
   - `reply` 말풍선 / `skillInfo` 이번 턴에 확정된 필드(프론트가 merge) / `choices` 있으면 카드로 뜸 / `summary` true면 주제·정의·타겟 요약카드+진행버튼 / `done` true면 다음 단계로.

### 백엔드가 해줄 것
1. **에이전트 호출을 어디서 돌릴지 결정**
   - (간단) 지금 Next.js 라우트 그대로 → 프로덕션 환경변수에 `ANTHROPIC_API_KEY`만 넣으면 됨.
   - (분리) 자기 서버에 같은 계약으로 구현 → 프론트는 `NEXT_PUBLIC_AGENT_BASE_URL` 값만 바꿈(화면 코드 안 건드림). 견본 라우트가 레퍼런스.
2. **API 키 관리** — 서버 환경변수로만. 프론트/깃에 절대 노출 X. (`.env*`는 gitignore됨)
3. **저장(DB)** — 완성된 스킬(`skillInfo`) 저장. 지금은 새로고침하면 전부 사라짐. 스킬 / 유저 / 소유권.
4. **게시된 스킬 조회** — `/skill/[slug]`가 지금은 URL 파라미터만 읽음 → DB에서 슬러그로 실제 조회하도록.
5. **게시 홈화면** — "스킬 게시하기" 버튼이 연결될 화면 (팀원 담당).
6. **파일 첨부** — 실제 업로드/저장/파싱 (skill-content 단계, 지금은 파일명만 캡처).

> `workflows/` 폴더의 md·json은 원본이니 **수정 없이 그대로** 프롬프트/스키마로 사용.

---

## 지금 데이터가 전혀 저장되지 않음

새로고침하면 모든 게 사라집니다. DB나 서버 저장소가 전혀 없고, 한 세션(브라우저 탭) 안에서만 상태가 유지돼요.

## 화면별 현재 동작 (mock)

### 1. 카테고리 선택 (`src/components/skill-creator/types.ts`)
- `CATEGORIES` 배열이 코드에 하드코딩되어 있음 (글쓰기/인테리어/커리어/재테크/바이브 코딩, 5개 + "기타")
- 마지막 "기타" 타일은 클릭하면 `CustomCategoryModal`이 열려서 사용자가 **직접 카테고리 이름을 입력하고 이모지를 고를 수 있음** — 이렇게 만든 커스텀 카테고리는 `{ id: "custom", label, emoji }` 형태로 그 세션에서만 쓰이고 어디에도 저장되지 않음 (이모지는 12개 프리셋 중 선택)
- 서버에서 카테고리 목록을 받아오거나, 사용자가 만든 커스텀 카테고리를 저장하는 로직 없음

### 2. 주제 정하기 — 발산 → 수렴 → 확정 (`SkillCreator.tsx`, `CandidatePicker.tsx`)
`workflows/what-skill.md` 워크플로우(발산 → 수렴 → 확정)를 프론트에 붙인 것. **지금은 mock**이고 에이전트 응답은 고정 문구.
- **발산(`brainstorm`)**: 카테고리 선택 직후 인사("안녕하세요! {카테고리}의 스킬 만들기를 시작할게요!") + "남들보다 잘하는 게 뭐예요?"로 시작. 사용자가 노하우 후보를 하나씩 입력하면 `candidates` 배열에 쌓고, 에이전트가 "①/②... 담아뒀어요, 또 있을까요?"로 되읽어줌. 사용자가 [이제 정리하기]를 누르면 수렴으로.
- **수렴(`picking`)**: 쌓인 후보를 `CandidatePicker`가 순위 카드(1위에 "추천" 뱃지)로 보여주고 하나 고르게 함. 지금 "순위"는 **입력 순서 그대로**(실제 랭킹 로직 없음) — 백엔드에서 what-skill 에이전트가 근거 있는 순위를 내려주면 그대로 꽂으면 됨.
- **확정**: 고른 후보를 `topic`으로 잡고, 이어서 "한 줄 정의", "타겟"을 하나씩 물어 `definition`/`target`에 저장(`awaiting_definition` → `awaiting_target`). 셋 다 채워지면 요약 카드 + STEP 3로.
- 이 단계에선 파일 첨부 버튼이 숨겨져 있음.

### 3. 스킬 내용 채우기 — 심층 인터뷰 (`SkillCreator.tsx`, phase `interviewing`)
`workflows/skill-content.md`를 붙인 것. 주제/정의/타겟이 끝나면 시작하며, **7항목을 한 번에 하나씩** 물어 `content`를 실제로 채웁니다(`CONTENT_INTERVIEW` 배열).
- 순서: 절차(`procedure`) → 규칙(`rules`) → 체크리스트(`checklist`) → 사례(`cases`) → 노하우(`knowhow`) → 안전장치(`safety`) → 말투(`tone`). 각 질문에 사용자가 답한 텍스트가 그대로 해당 필드에 저장됨(`contentDraft` → 완료 시 `content`). 말투에서 "괜찮아요/없어요" 류로 답하면 빈 문자열.
- **여기서 채운 `content`가 STEP 5의 `SkillPreview`(skill.md 더보기)에 그대로 뜹니다.** 즉 미리보기는 이제 mock이 아니라 이 인터뷰 결과임.
- 질문 문구는 고정(실제 AI 없음) — 백엔드 skill-content 에이전트가 붙으면 답변에서 알맹이를 추출해 `content`를 채우는 방식으로 바뀜. 지금은 "답 = 필드값" 1:1 매핑.
- 파일 첨부(`AttachModal`)는 이 단계에서 열리지만 **파일명만** 캡처하고 실제 내용은 읽지 않음(에이전트가 읽어 알맹이로 소화하는 건 백엔드 몫). 첨부해도 인터뷰는 다음 질문으로 넘어가지 않고 사용자가 텍스트로 답하면 진행.
- (참고) 테스트 보고서(STEP 5)는 아직 canned mock이라, 사용자가 안전장치를 채워도 보고서엔 "안전장치 없음"으로 나올 수 있음 — 실제 진단은 백엔드 skill-test가 `content` 기반으로 생성.

### 3-0. 이름 짓기 (`NamingStep`, phase `naming`)
`workflows/skill-name.md`를 붙인 것. 서로 다른 **3각도(명확형/호기심형/구체·혜택형)**로 이름을 제안하고, 각 이름 아래 "왜 눈길을 끄는지" 한 줄 설명을 붙임. [다른 이름 더 보기]로 다른 각도의 3개를 더 보여주고, 직접 입력도 가능. `nameSuggestions(topic, batch)`(types.ts)가 주제를 템플릿에 끼워넣는 mock — 백엔드 skill-name 에이전트가 붙으면 스킬 알맹이에서 이름을 짓는 방식으로 교체.

## ⭐ 백엔드 연동 지점 (integration-ready 구조)
프론트를 **에이전트만 꽂으면 되는** 상태로 정리해놨습니다.
- **데이터는 `skillInfo` 객체 하나** (`SkillCreator`의 state, 타입 `SkillInfo` = `workflows/skill_info.json` 스키마 그대로: category/topic/definition/target/content{7}/name/testReport). 각 단계는 `patchInfo(...)`로 자기 필드만 채움. **백엔드 응답을 이 객체에 merge하면 화면이 그려짐.** (렌더용 Category 객체(이모지)만 별도로 들고 있고, contract용 라벨은 `skillInfo.category`.)
- **에이전트 발화 지점(AGENT SEAM)**: `SkillCreator.tsx`의 `agentReply`가 말풍선을 띄우는 렌더 지점. 무엇을 말할지·어떤 필드를 채울지는 `handleSend`의 각 phase 분기가 정함(전부 고정 mock 문구). **연동 시 각 phase 분기를 `POST /api/agent/{step}` 호출로 교체** — 요청 `{ skillInfo, messages, userMessage }`, 응답 `{ reply, skillInfo(patch), done }`. 화면/흐름/phase 머신은 그대로 두고 분기 속만 바꾸면 됨. (step = what-skill | skill-content | skill-name | skill-test | skill-improve)
- phase → 화면단계 매핑은 `STEP_BY_PHASE`. 진행바(6단계)와 렌더는 프론트가 관리, 에이전트 응답만 백엔드가 내려줌.

### 3-1. 완성된 스킬 확인 + 테스트 + 개선 (`SkillPreview` / `TestReport` / `ImproveStep`)
이 세 화면은 팀원이 `workflows/`에 올린 6단계 에이전트 워크플로우(what-skill → skill-content → skill-name → skill-test → skill-improve)를 프론트에 붙인 것입니다. **지금은 전부 mock**이고, 실제 값은 각 에이전트가 `skill_info.json` / `test_report.json` 스키마로 내려주면 그 자리에 꽂으면 됩니다.
- **STEP 5 흐름**: 이름 확정 → ① `SkillPreview`로 완성된 스킬(skill.md 알맹이 = `content`)을 "더보기"로 보여줌 → ② "테스트해볼까요?"에서 샘플 질문을 보여주고 [테스트 시작하기] → ③ `TestReport`로 진단 보고서 표시 → ④ [스킬 개선하기] 또는 [개선 없이 바로 게시하기] 갈림길
- `content`는 `mockSkillContent()`(types.ts)가 만든 가짜 7항목(절차/규칙/체크리스트/사례/노하우/안전장치/말투). 실제로는 skill-content 에이전트가 채움. (안전장치는 일부러 비워둬서 테스트 보고서의 "안전장치 없음"과 이어지게 함)
- `testReport`는 `mockTestReport(name)`가 만든 가짜 진단. **`workflows/test_report.json` 스키마를 그대로 따름** (sampleQuestions / diagnosis 8영역 등급 / benchmark 통과율·시간·AI비용 / analystNotes). 실제로는 skill-test 에이전트 출력.
- **STEP 6 개선(`ImproveStep`)**: 보고서에서 등급 3 이하인 영역만 골라 보여주고 고를 수 있게 함. 지금은 항목 선택 후 "완성하기"만 하는 껍데기 — 실제 개선(skill-improve 방식의 재인터뷰로 `content` 업데이트)은 백엔드 연동 후.

### 4. 스킬 게시 (`PackagedResult`)
- 개선까지 끝나거나 "바로 게시하기"를 누르면 게시 화면(`PackagedResult`)이 뜸. **실제 "홈에 게시" 기능은 팀원이 만들 홈 화면에 붙을 예정** — 지금은 다운로드 / 스킬 사용하기만 동작.
- `version`, `slug`는 클라이언트에서 그 자리에서 만든 문자열입니다 (`skill_${slug(category)}_v1.0`, `${slug(category)}-${메시지개수}`) — **전역적으로 유일하다는 보장이 없음**
- "다운로드" 버튼은 지금까지의 대화를 markdown 문자열로 조립해서 **브라우저에서 바로 파일 다운로드**시킬 뿐, 서버에는 안 남음
- "스킬 사용하기" 링크는 `skillName`, `category`, `emoji`만 URL 쿼리로 넘기고 이동함 — **대화 내용(markdown), content, testReport는 함께 넘어가지 않음**
- (구 `PackagingCard`, `PlaceholderPanel` 컴포넌트는 이 흐름 개편으로 더 이상 안 쓰임 — 파일만 남아있음)

### 5. 스킬 사용하기 (`/skill/[slug]`, `SkillUsageChat.tsx`)
- `slug`는 URL에 있지만 실제로 그 슬러그로 뭔가를 조회하지 않음 — 헤더에 표시되는 이름/카테고리/이모지는 전부 쿼리 파라미터로 받은 값
- 사용자가 메시지를 보내면 **미리 정해둔 3개 문구를 순서대로 돌려가며** 보여줄 뿐, 그 스킬이 실제로 뭘 배웠는지와 무관한 응답임

## 정리하면, 논의가 필요해 보이는 부분

- 스킬 생성 대화(질문 Agent)를 실제 LLM 호출로 바꿀지, 어떤 프롬프트/컨텍스트로 할지
- 완성된 스킬(이름/카테고리/대화 내용/첨부자료)을 저장할 데이터 모델과 API (생성/조회)
- `/skill/[slug]`가 URL 파라미터 대신 실제 저장된 스킬을 슬러그로 조회하도록 바꾸는 API
- 스킬 사용 챗에서 그 스킬의 실제 내용을 반영해 응답하는 방식 (RAG? 프롬프트에 그대로 주입?)
- 파일 첨부의 실제 업로드/저장/파싱
- 사용자 계정/로그인 여부 (현재 전혀 없음 — 스킬 소유권 개념이 없음)
