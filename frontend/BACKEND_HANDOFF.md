# 백엔드 연동 요청 정리

프론트(`frontend/`)에서 백엔드에 요청하는 것들을 **급한 순서대로** 모았습니다.
공통 원칙: **화면은 미리 다 만들어 두고**, API가 생기면 플래그를 켜거나 저장소 구현만
바꾸면 붙도록 해뒀습니다. 각 항목에 "프론트 상태 / 필요한 것 / 붙이는 법"을 적었습니다.

로컬 실행·테스트 절차는 저장소 루트 `README.md`의 "6. 프론트엔드 연동 테스트"와
`docs/frontend-integration.md` 참고.

---

## 지금 붙어 있는 것 (참고)

| 기능 | 상태 |
|---|---|
| 스킬 만들기 파이프라인 | ✅ `what_skill` → `skill_content` → `skill_name` → `skill_test` → `skill_improve` → `confirm` 전부 실제 호출 (`backendClient.ts`) |
| 스킬 목록 | ✅ `GET /skills?user_id=` — 내 홈의 "내 스킬" 탭 |
| 스킬로 대화하기 | ✅ `GET /skills/{id}` + `POST /chat/{id}` — `/skill/[id]` 화면 |
| 스킬 직접 등록 | ✅ `POST /skills` — "내 스킬 넣기"(`/skill/new`). 넣은 프롬프트가 `md_content`로 저장돼 그대로 대화에 쓰입니다. **추가 작업 없음** |
| 스킬 삭제 | ✅ `DELETE /skills/{id}` — 내 스킬 목록에서 스와이프(터치)/호버(마우스) → 삭제. **추가 작업 없음** |
| 인증 | ⚠️ `NEXT_PUBLIC_DEV_TOKEN`(로컬 서명 토큰)으로 우회 중. 아래 1번이 열리면 제거 예정 |

---

## 🔴 1. 소셜 로그인 — 설정 2가지 (가장 급함)

**이게 막혀서 앱에 정상 진입이 안 됩니다.** user-service의 기존 계약
(`/auth/login/{provider}` → `login_url`, `/auth/callback?code=` → `TokenResponse`)은
그대로 쓰고, 프론트 연동 코드(`src/lib/authClient.ts`)와 화면(`/login`, `/auth/callback`)은
이미 완성돼 있습니다.

**흐름**: `/login`에서 제공자 선택 → `GET {user-service}/auth/login/{kakao|google}`로 로그인
URL을 받아 이동 → 인증 후 `CALLBACK_URL`로 `code`와 함께 복귀 → 프론트가
`GET {user-service}/auth/callback?code=`로 토큰 교환 → 세션 저장 후 `/home` 진입.

### 필요한 것

**(1) CORS 허용** — `user-service/main.py`에 CORS 미들웨어가 **아예 없습니다.**
브라우저에서 확인한 실제 에러:
```
Access to fetch at 'http://localhost:8001/auth/login/kakao'
from origin 'http://localhost:3000' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present
```
`curl`로는 200 OK로 잘 오는데 브라우저만 막힙니다. skill-service처럼 `CORSMiddleware`로
프론트 오리진(로컬 `http://localhost:3000`, 배포는 Vercel 도메인)을 허용해 주세요.

**(2) CALLBACK_URL을 프론트로** — 실제 발급되는 로그인 URL을 까보면
`redirect_to=http%3A%2F%2Flocalhost%3A8001%2F` 입니다. 즉 인증 후 사용자가 **백엔드로**
돌아가서 프론트가 토큰을 받을 수 없습니다.
- `user-service/.env`의 `CALLBACK_URL`을 **`http://localhost:3000/auth/callback`**
  (배포 시 프론트 도메인)로 변경
- **Supabase 대시보드의 Redirect URL 허용 목록에도 같은 주소 추가** 필요

### 붙이는 법
프론트는 별도 작업 없이 바로 동작합니다. 이후 임시 코드 정리만 하면 됩니다
(`/auth/mock/[provider]` 라우트와 `isDevLoginAvailable` 폴백 — 전부 `[임시]` 주석 표시).

### 같이 확인해 주세요
- 프론트는 access/refresh 토큰을 `localStorage`에 저장합니다(키 `skillsns.*`). XSS 노출
  위험이 있어 실서비스 전 **httpOnly 쿠키** 방식으로 옮길지 함께 정해야 합니다.
- 로그인이 붙으면 `NEXT_PUBLIC_DEV_TOKEN` 우회를 제거할 예정입니다. **user-service가 발급한
  토큰을 skill-service가 그대로 검증할 수 있나요?** (JWT_SECRET_KEY/알고리즘 공유 여부)
- 프론트 로그인 버튼은 카카오·구글 2종만 노출합니다(백엔드도 이제 이 2종만 지원, naver 제거됨).
- 소셜 버튼 로고는 인라인 SVG 근사본이라, 배포 전 카카오/구글 **공식 애셋**으로 교체 필요.

---

## 🔴 2. skill-service가 유휴 상태 후 DB 연결이 끊깁니다 (개발 계속 막힘)

**증상**: 컨테이너를 띄워 둔 채 몇 시간 지나면, 이후 모든 요청이 500이 됩니다.
프론트 화면에는 그냥 "failed to fetch"로만 보여서 원인을 찾기 어렵습니다.
2026-08-03 하루에만 5번 넘게 겪었고, 그때마다 `docker restart`로만 풀렸습니다.

**혼동 포인트** — 겉으로는 정상처럼 보입니다.
- `docker ps` → `Up N hours` (컨테이너는 살아 있음)
- `GET /` 헬스체크 → **200** (DB를 안 타는 경로라 통과)
- 그런데 `POST /skills/create` 같은 **DB를 쓰는 요청만 500**

**실제 로그** (`docker logs skillsns-team-skill-service-1`):
```
psycopg.OperationalError: the connection is closed
  File ".../langgraph/checkpoint/postgres/aio.py", line 205, in aget_tuple
  File ".../psycopg/_connection_base.py", line 532, in _check_connection_ok
```
langgraph의 Postgres 체크포인터가 들고 있는 커넥션이 끊긴 뒤 재연결되지 않는 것으로 보입니다.
(Supabase 쪽 유휴 타임아웃에 걸리는 것 같습니다.)

**요청**: 커넥션 풀에 **pre-ping / 자동 재연결**을 걸어 주세요. 예를 들어
- SQLAlchemy 엔진: `pool_pre_ping=True`, `pool_recycle=<타임아웃보다 짧게>`
- langgraph `AsyncPostgresSaver`가 쓰는 psycopg 풀에도 동일하게 재연결 옵션 적용

**현재 우회법**: `docker restart skillsns-team-skill-service-1`
확인은 헬스체크가 아니라 **실제 DB를 타는 요청**으로 해야 합니다:
```bash
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8002/skills/create \
  -H "Authorization: Bearer $DEV_TOKEN" -F "category=여러 분야"
```

---

## 🟡 3. 프로필 편집 (사진 / 닉네임 / 소개글)

**프론트 상태**: 내 홈(`/home`)과 프로필 편집 화면(`/profile/edit`) 완성. 사진 미리보기,
글자수 제한, 저장 버튼까지 동작합니다. 클라이언트 함수도 준비됨
(`authClient.ts`의 `updateProfile` / `uploadAvatar`).

**붙이는 법**: `src/app/profile/edit/page.tsx`의 `PROFILE_SAVE_ENABLED`(현재 `false`)를
`true`로만 바꾸면 됩니다.

### (1) users 테이블 컬럼 추가
- `bio` (text, nullable) — 소개글. 프론트에서 80자로 제한해 보냅니다.
- `avatar_url` (text, nullable) — 프로필 사진 URL.
- 두 필드를 `/auth/me` 응답(`UserInfo`)에도 포함해 주세요. 프론트 타입은 이미 optional로
  열어 뒀습니다.

### (2) 프로필 수정
```
PATCH /auth/me
Authorization: Bearer <access_token>
Content-Type: application/json
  { "nickname"?: string, "bio"?: string, "avatar_url"?: string | null }
→ 200 UserInfo (수정 반영된 값)
```
부분 수정(보낸 필드만 반영). 닉네임은 프론트에서 1~20자로 제한해 보냅니다.

### (3) 프로필 사진 업로드
```
POST /auth/me/avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
  file=<이미지 파일>
→ 200 { "avatar_url": "https://…" }
```
- 저장 위치(Supabase Storage 등), 허용 용량·확장자는 백엔드 판단에 맡깁니다.
- 프론트는 `uploadAvatar` → 받은 URL을 `PATCH /auth/me`에 실어 보내는 순서로 호출합니다.

---

## 🟡 4. 스킬 스크랩 + 폴더

**프론트 상태**: 기능이 **전부 동작합니다** — 다만 저장이 브라우저(localStorage)라
기기·계정 간 공유가 안 됩니다.
- 홈 "스크랩" 탭: 폴더 목록(담긴 개수), 폴더 만들기 / 이름 바꾸기 / 삭제, 폴더 안 스킬 목록
- 스킬 대화 화면(`/skill/[id]`) 우측 상단 🔖 → 폴더 선택 시트(새 폴더 만들어 담기 포함)

**붙이는 법**: `src/lib/scrapStore.ts` **한 파일의 구현만** fetch 호출로 바꾸면 됩니다.
화면 코드는 이 파일의 함수만 쓰고 있어서 손댈 필요가 없습니다.

### 필요한 API (프론트 함수와 1:1)

```
GET    /scrap/folders                 → [{ id, name, created_at, skill_count }]
POST   /scrap/folders                 { name }            → 생성된 folder
PATCH  /scrap/folders/{folder_id}     { name }            → 수정된 folder
DELETE /scrap/folders/{folder_id}                         → 폴더 + 안의 스크랩 함께 삭제

GET    /scrap                         [?folder_id=]       → [{ skill_id, folder_id, added_at }]
POST   /scrap                         { skill_id, folder_id }  → 담기(이미 있으면 폴더 이동)
DELETE /scrap/{skill_id}                                  → 빼기
```
전부 `Authorization: Bearer <access_token>` 기준의 **사용자별** 데이터입니다.

### 정해야 할 것
- 지금 프론트는 **한 스킬은 폴더 하나에만** 담기게 했습니다(다시 담으면 폴더 이동).
  여러 폴더에 중복 허용할지 정해주세요 — 허용하면 `DELETE /scrap/{skill_id}`에
  `folder_id`가 필요합니다.
- 폴더 이름 중복·길이 제한 정책.

---

## 🟡 5. 피드 · 채팅 목록 데이터 (화면은 완성, 데이터가 목업)

하단 네비의 **피드**와 **채팅 목록** 화면이 붙었습니다. UI·로딩·에러·빈 상태까지 다 되어 있고
**데이터만 목업**입니다. 각각 함수 하나가 유일한 교체 지점입니다.

### (1) 피드 — `src/components/feed/feedData.ts`의 `getFeedCards()`
지금은 `MOCK_FEED_CARDS`를 반환합니다. 화면이 카드 하나당 쓰는 값:

| 필드 | 지금 | 백엔드에서 받고 싶은 것 |
|---|---|---|
| `id`, `title` | ✅ `GET /skills`로 가능 | 그대로 |
| `categoryId` | ⚠️ 목업 | 스킬의 카테고리 (필터 칩에 씀) |
| `author.name` | ❌ 없음 | **스킬 만든 사람 닉네임** — 지금 `/skills`는 `user_id`만 줍니다 |
| `comment` | ❌ 없음 | 스킬 주인이 남긴 "한마디" (한 줄 소개) |
| `qa` | ❌ 없음 | 미리보기용 대표 질문/답변 1쌍 |
| `scrapCount` | ❌ 없음 | 스크랩된 횟수 (4번 항목과 연결) |

- **최소안**: `GET /skills`에 **작성자 닉네임**만 얹어 줘도 카드가 서게 됩니다
  (comment·qa는 프론트에서 description으로 대체 가능).
- **추천안**: 피드 전용 엔드포인트(예: `GET /feed`)로 위 필드를 한 번에 내려주기.
  정렬 기준(최신순/인기순)과 페이지네이션도 이때 정해 주세요.
- 상단 "요즘 뜨는 스킬"(`MOCK_TRENDING`)도 같은 목업입니다 — 인기 스킬 몇 개를 주면 됩니다.

### (2) 채팅 목록 — `src/components/chat_list/chatData.ts`의 `getChats()`
지금은 `MOCK_CONVERSATIONS`를 반환합니다. **"내가 어떤 스킬과 대화했는지" 목록 API가 없습니다.**

```
GET /chat/sessions            (이름은 편한 대로)
Authorization: Bearer <access_token>
→ [{ skill_id, skill_title, last_message, last_message_at, summary? }]
```
프론트가 쓰는 모양은 `Conversation`(`chat_list/types.ts`):
`id`(=스킬 id, 탭하면 `/skill/{id}`로 이동) · `skillName` · `avatar` · `summary` · `lastMessage` · `timeLabel`
- `summary`는 없으면 생략 가능(프론트에서 마지막 메시지로 대체).
- `timeLabel`("어제", "3일 전")은 프론트에서 만들 테니 **ISO 시각**만 주세요.

## 🟢 6. 스킬 만들기 파이프라인 관련

### (1) 이전 단계로 되돌리기 (revert)
**프론트 상태**: "이 단계부터 수정" 버튼·핸들러·클라이언트 함수(`revertToStage`) 완성,
현재 비활성.
**붙이는 법**: `SkillCreator.tsx`의 `EDIT_BACK_ENABLED`를 `true`로.

```
POST /skills/create/{draft_id}/revert
Content-Type: multipart/form-data
  stage=<what_skill | skill_content | skill_name | skill_test>
→ 200 CreationResponse (기존과 동일한 모양)
```
**기대 동작**: 지정 stage 이후로 누적된 `skill_info`·대화를 폐기 → draft stage를 지정
stage로 되돌림 → 그 stage의 **시작 상태**(안내/질문 메시지 포함)를 응답.
이미 `confirm`(게시)된 draft는 revert 불가 → 409 등 에러 권장(`detail`을 프론트가 그대로 노출).

### (2) 카테고리를 대화에서 확정
프론트에서 **카테고리 선택 단계를 없앴습니다.** 앱 로드 시 자동으로 draft를 시작하고,
분야는 첫 단계(주제 정하기) 대화에서 정해집니다.
- **현재 임시 처리**: `create`가 category를 필수(`Form(...)`)로 요구해서 중립 기본값
  `"여러 분야"`(`SkillCreator.tsx`의 `DEFAULT_CATEGORY`)로 시작합니다. 첫 질문이 열린
  형태로 나와 대화는 자연스러운데, **`skill_info.category`엔 "여러 분야"가 그대로 저장**됩니다.
- **요청**: (1) create에서 category를 옵션으로 받거나 빈 값 허용, (2) what_skill 대화에서
  실제 분야를 파악해 `skill_info.category`를 확정·저장. 그래야 게시된 스킬에 실제
  카테고리가 담깁니다.

### (3) 테스트 리포트가 불완전하게 오는 경우
채점(`test_node`의 `grade_llm` → `SkillTestOutput`)이 **가끔 리포트를 불완전하게 생성**합니다.
실제 관측: 채점은 200 OK인데 `benchmark.passRate`가 통째로 빠져서, 프론트가 그 필드를 읽다
런타임 크래시(앱 화이트아웃)했습니다.
- **프론트 대응(완료)**: `TestReport`를 방어적으로 수정 — 없는 섹션/필드는 건너뛰고 앱이
  죽지 않습니다. 단 값이 없으면 그 부분은 화면에 안 나옵니다.
- **요청**: `test_report.schema.json`은 `benchmark.passRate/time/aiCost`를 required로
  정의하지만 LLM tool-call이 항상 채우진 않습니다. 스키마 검증 후 재요청 또는 프롬프트
  강화로 **완전한 리포트를 보장**해 주세요.

### (4) 테스트/개선 단계의 자유 메시지 — 확인 요청
입력창을 주제·내용 단계뿐 아니라 **테스트·개선 단계에도** 띄웁니다
(`SkillCreator.tsx`의 `CHAT_INPUT_PHASES`). 그 단계에서 입력한 자유 메시지는 기존
`continueDraft`와 동일하게 `POST /skills/create/{draft_id}`로 전송됩니다.
- skill-service가 `skill_test` / `skill_improve` stage에서 들어온 자유 메시지를 받아
  처리(예: "이 부분을 이렇게 고쳐줘")해 주는지 확인이 필요합니다.
- 처리 방식(무시 / 에러 / 개선 반영)을 정해주세요.

---

## 그 외 다듬을 거리

- **파일 첨부** — `AttachModal`에서 고른 파일이 `continueDraft`로 전송되고 백엔드가 텍스트를
  추출하지만, 첨부 UX(진행 표시, 실패 처리)는 다듬을 여지가 있습니다.
- **피드 정렬 기준** — 위 5번에서 API를 정할 때, 피드를 무엇으로 채울지도 정해야 합니다
  (전체 스킬 최신순 / 인기순 / 나중에 팔로우 기반).
