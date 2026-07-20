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
