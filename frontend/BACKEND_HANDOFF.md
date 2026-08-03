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

## [백엔드 요청] 소셜 로그인 연동 — user-service 설정 2가지

프론트에 로그인 화면(`/login`)과 OAuth 콜백(`/auth/callback`)을 붙였다. user-service의
기존 계약(`/auth/login/{provider}` → `login_url`, `/auth/callback?code=` → `TokenResponse`)을
그대로 쓰며, 프론트 연동 코드는 `src/lib/authClient.ts`에 있다.

**흐름**: `/login`에서 제공자 선택 → `GET {user-service}/auth/login/{kakao|google}`로 로그인
URL을 받아 이동 → 인증 후 `CALLBACK_URL`로 `code`와 함께 복귀 → 프론트가
`GET {user-service}/auth/callback?code=`로 토큰 교환 → 세션 저장 후 `/home` 진입.

동작하려면 user-service 쪽 설정 2가지가 필요하다.

1. **CORS 허용** — `user-service/main.py`에 CORS 미들웨어가 없어서, 브라우저에서 프론트
   (`http://localhost:3000`)가 8001을 호출하면 차단된다. skill-service처럼
   `CORSMiddleware`로 프론트 오리진(로컬 `http://localhost:3000`, 배포는 Vercel 도메인)을
   허용해 주세요.
2. **CALLBACK_URL을 프론트로** — 현재 `user-service/.env`의 `CALLBACK_URL`이 user-service
   자신(`http://localhost:8001/auth/callback`)을 가리킨다. 그러면 인증 후 사용자가 백엔드
   JSON 화면에 떨어지고 프론트가 토큰을 받을 수 없다. **`http://localhost:3000/auth/callback`**
   (배포 시 프론트 도메인)로 바꿔야 한다. Supabase 대시보드의 Redirect URL 허용 목록에도
   같은 주소를 추가해야 한다.

**그 외 확인 사항**
- 프론트는 지금 access/refresh 토큰을 `localStorage`에 저장한다(키 `skillsns.*`). XSS 노출
  위험이 있어 실서비스 전에는 httpOnly 쿠키 방식으로 옮길지 함께 정해야 한다.
- 로그인 연동이 끝나면 skill-service 호출에 쓰던 `NEXT_PUBLIC_DEV_TOKEN` 우회를 제거하고,
  발급받은 access token을 쓰도록 `backendClient.ts`를 바꿀 예정. **user-service가 발급한
  토큰을 skill-service가 그대로 검증할 수 있는지**(JWT_SECRET_KEY/알고리즘 공유 여부) 확인 필요.
- 프론트 로그인 버튼은 카카오·구글 2종만 노출한다(백엔드는 naver도 지원).
- 소셜 버튼 로고는 지금 인라인 SVG 근사본이라, 배포 전 카카오/구글 **공식 애셋**으로 교체 필요.

## [백엔드 요청] 프로필 편집 (사진 / 닉네임 / 소개글)

내 홈(`/home`)과 프로필 편집 화면(`/profile/edit`)을 프론트에 다 만들어 뒀다. 폼·미리보기·
글자수 제한·저장 버튼까지 동작하며, **아래 API가 생기면 `PROFILE_SAVE_ENABLED`(현재 `false`,
`src/app/profile/edit/page.tsx`)만 `true`로 바꾸면 바로 붙는다.**
클라이언트 함수는 `src/lib/authClient.ts`의 `updateProfile` / `uploadAvatar`.

**1. users 테이블 컬럼 추가**
- `bio` (text, nullable) — 소개글. 프론트는 80자로 제한해서 보낸다.
- `avatar_url` (text, nullable) — 프로필 사진 URL.
- 두 필드를 `UserInfo`(= `/auth/me` 응답)에도 포함해 주세요. 프론트 타입은 이미
  optional로 열어 뒀습니다.

**2. 프로필 수정**
```
PATCH /auth/me
Authorization: Bearer <access_token>
Content-Type: application/json
  { "nickname"?: string, "bio"?: string, "avatar_url"?: string | null }
→ 200 UserInfo (수정 반영된 값)
```
- 부분 수정(보낸 필드만 반영). 닉네임은 프론트에서 1~20자로 제한해 보냅니다.

**3. 프로필 사진 업로드**
```
POST /auth/me/avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
  file=<이미지 파일>
→ 200 { "avatar_url": "https://…" }
```
- 저장 위치(Supabase Storage 등)와 허용 용량·확장자는 백엔드 판단에 맡깁니다.
- 프론트는 저장 시 `uploadAvatar` → 받은 URL을 `PATCH /auth/me`에 실어 보내는 순서로 호출합니다.

## [백엔드 요청] 스킬 스크랩 + 폴더

내 홈의 **스크랩 탭**은 지금 빈 상태("아직 스크랩한 스킬이 없어요")로만 두었다. 백엔드에
스크랩/폴더 관련 테이블·API가 전혀 없어서다. 기능을 붙이려면 대략 아래가 필요하다.

- **폴더**: 생성/이름변경/삭제, 사용자별 목록 (`name`, 스킬 개수)
- **스크랩**: 스킬을 폴더에 담기/빼기, 폴더별 스킬 목록
- 화면 설계상 폴더는 **이름을 사용자가 정할 수 있어야** 하고, 폴더 안에 스킬 리스트가 들어간다.

API 모양이 정해지면 알려주세요. 프론트 화면은 그에 맞춰 붙이겠습니다.

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
