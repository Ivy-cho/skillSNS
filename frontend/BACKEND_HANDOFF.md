# 백엔드 연동 현황 메모

`src/components/skill-creator/SkillCreator.tsx`는 이제 mock이 아니라 실제 skill-service
백엔드(`/skills/create/*`)를 `src/lib/backendClient.ts`를 통해 직접 호출합니다. 로컬에서
직접 띄우고 테스트하는 방법은 저장소 루트 `README.md`의 "6. 프론트엔드 연동 테스트"와
`docs/frontend-integration.md`(더 자세한 절차·트러블슈팅) 참고.

## 지금 실제로 붙어있는 것

- **파이프라인 5단계**: 카테고리 선택 → `what_skill`(주제/정의/타겟) → `skill_content`(7항목
  인터뷰) → `skill_name`(이름 후보/직접입력) → `skill_test`(실제 이중 실행 채점) →
  `skill_improve`/`retest` 루프 → 게시(`confirm`). 전부 `backendClient.ts`의
  `startDraft/continueDraft/improveDraft/retestDraft/confirmDraft`로 호출.
- **데이터**: `skillInfo`(타입 `SkillInfo`, `types.ts`) 하나에 백엔드 응답의 `skill_info`를
  그대로 merge. 화면은 이 객체만 있으면 그려짐.
- **인증**: `NEXT_PUBLIC_DEV_TOKEN`(`.env.local`, 로컬 전용 서명 토큰)으로 우회 — 아직
  user-service의 실제 로그인 흐름과는 연결 안 됨.
- **저장**: `confirm` 호출 시 skill-service가 실제 `skills` 테이블에 저장.

## 아직 논의/구현이 필요한 부분

- **실제 로그인 연동** — user-service 소셜 로그인과 프론트를 붙이고, `NEXT_PUBLIC_DEV_TOKEN`
  우회를 제거하는 작업.
- **게시 홈화면** — `PackagedResult`의 "홈에 게시" 동선이 아직 없음.
- **스킬 사용 챗(`/skill/[slug]`, `SkillUsageChat.tsx`)** — 지금은 그 스킬의 실제 내용과
  무관하게 정해진 문구 몇 개를 순서대로 보여줄 뿐. `/skill/[slug]`도 URL 쿼리 파라미터만
  읽고 실제 DB 조회는 안 함 — 실제 스킬 내용을 반영해 응답하는 방식(스킬별 대화 엔드포인트
  연동)이 필요.
- **파일 첨부** — `AttachModal`에서 고른 파일이 `backendClient.continueDraft`로 실제
  전송은 되지만(백엔드가 텍스트만 추출), 첨부 UX(진행 표시, 실패 처리)는 다듬을 여지 있음.

## [백엔드 요청] 이전 단계로 되돌리기 (revert) API

스텝형 UI에서 사용자가 이전 단계로 돌아가 **답을 수정하고 그 단계부터 다시 진행**할 수
있어야 합니다. 프론트는 이미 다 붙여뒀고(버튼·핸들러·클라이언트 함수), skill-service가
아래 엔드포인트를 제공하면 프론트에서 플래그 하나만 켜서 활성화됩니다.

- **활성화 플래그**: `SkillCreator.tsx`의 `EDIT_BACK_ENABLED`(현재 `false`). 백엔드가
  준비되면 `true`로 바꾸면 "이 단계부터 수정" 버튼이 실제 동작.
- **클라이언트 함수**: `backendClient.ts`의 `revertToStage(draftId, stage)`.

**요청**
```
POST /skills/create/{draft_id}/revert
Content-Type: multipart/form-data
  stage=<되돌릴 대상 stage 문자열>
```
`stage` 값은 기존 파이프라인과 동일한 문자열: `what_skill` | `skill_content` |
`skill_name` | `skill_test`.

**기대 동작**
1. 지정한 `stage` **이후로** 누적된 `skill_info` 필드와 대화를 폐기(rewind).
2. draft의 현재 stage를 지정 stage로 되돌림.
3. 그 stage의 **시작 상태**(안내/질문 메시지 포함)를 담아 응답.

**응답**: 기존과 동일한 `CreationResponse`
(`draft_id`, `stage`, `messages`, `skill_info`, `choices?`, `summary?`).
즉 프론트는 `continueDraft`/`improveDraft`와 똑같이 `applyResponse(res)`로 처리하며,
반환된 `stage`가 곧 사용자가 다시 진행할 단계가 됩니다.

**엣지 케이스**: 이미 `confirm`(게시)된 draft는 revert 불가 → 409 등 에러 응답 권장
(`detail` 메시지는 프론트가 그대로 노출).

## [백엔드 확인 필요] 테스트/개선 단계 자유 메시지

스텝형 UI에서 입력창을 2·3단계뿐 아니라 **5(테스트)·6(개선) 단계에도** 띄우기로 했습니다
(`SkillCreator.tsx`의 `CHAT_INPUT_PHASES`). 사용자가 그 단계에서 입력한 자유 메시지는
기존 `continueDraft`와 동일하게 `POST /skills/create/{draft_id}` 로 전송됩니다.

- **확인 요청**: skill-service가 `skill_test` / `skill_improve` stage에서 들어온 자유
  메시지를 받아 처리(예: "이 부분을 이렇게 고쳐줘" 같은 개선 지시 반영)해 주는지 확인 필요.
- 지금은 프론트에서 전송만 하며, 백엔드가 해당 stage 메시지를 처리하지 않으면 UX가
  기대대로 동작하지 않을 수 있음. 처리 방식(무시/에러/개선반영)을 정해주세요.

## [백엔드 요청] 카테고리를 대화에서 정하기 (카테고리 선택 단계 제거)

프론트에서 **카테고리 선택 단계를 없앴다.** 이제 앱 로드 시 자동으로 draft를 시작하고,
분야는 첫 단계(주제 정하기) 대화에서 자연스럽게 정한다.

- **현재(프론트 임시 처리)**: `create`가 category를 필수(`Form(...)`)로 요구해서, 프론트가
  중립 기본값 `"여러 분야"`(`SkillCreator.tsx`의 `DEFAULT_CATEGORY`)로 시작한다. 그러면
  what_skill 첫 질문이 "평소에 어떤 주제로 조언을 구하러 오나요?"처럼 열린 형태로 나와
  분야를 대화로 끌어낸다. **단, skill_info.category엔 "여러 분야"가 그대로 저장된다.**
- **백엔드 요청**: (1) create에서 category를 선택(옵션)으로 받거나 빈 값 허용, (2) what_skill
  대화에서 실제 분야를 파악해 `skill_info.category`를 확정·저장하도록 프롬프트/머지 보강.
  그래야 게시된 스킬에 "여러 분야" 대신 실제 카테고리가 담긴다.

## [백엔드 데이터 품질] 테스트 리포트(test_report)가 불완전하게 오는 경우

채점(`test_node`의 `grade_llm` → `SkillTestOutput`)이 **가끔 리포트를 불완전하게 생성**함.
실제 관측: 채점은 200 OK로 성공했는데 `benchmark.passRate`가 통째로 빠진 리포트가 와서
프론트 `TestReport`가 `benchmark.passRate.withSkill`을 읽다 런타임 크래시(앱 화이트아웃).

- **프론트 대응(완료)**: `TestReport`를 방어적으로 수정 — 없는 섹션/필드는 건너뛰고 앱이
  죽지 않게 함. 단, 값이 없으면 그 부분은 화면에 안 나온다(불완전한 리포트로 보임).
- **백엔드 요청**: `test_report.schema.json`은 `benchmark.passRate/time/aiCost`를 required로
  정의하지만 LLM tool-call이 이를 항상 채우진 않음. grade_llm 출력의 스키마 검증/재시도
  (누락 시 다시 요청) 또는 프롬프트 강화로 **완전한 리포트를 보장**해 주세요.
