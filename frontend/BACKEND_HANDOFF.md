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
| 소셜 로그인 | ✅ CORS/CALLBACK_URL 배선 완료(아래 1번). naver 제거, google/kakao만 지원 |
| 프로필 편집 | ✅ `PATCH /auth/me`, `POST /auth/me/avatar` 구현 완료(아래 3번). `PROFILE_SAVE_ENABLED=true`로 전환함 |
| 스킬 스크랩 + 폴더 | ✅ `GET/POST/PATCH/DELETE /scrap`, `/scrap/folders` 구현 완료(아래 4번). `scrapStore.ts`가 localStorage 대신 API 호출 |
| 피드 | ✅ 신규 feed-service(8003) `GET /feed` 구현 완료(아래 5-1번). `feedData.ts`가 mock 대신 API 호출, 트렌딩 칩도 실데이터에서 파생 |
| 채팅 목록 | ✅ `GET /chat/sessions` 구현 완료(아래 5-2번). `chatData.ts`가 mock 대신 API 호출 |
| 인증 | ✅ 실 로그인 세션의 access token을 그대로 사용. `NEXT_PUBLIC_DEV_TOKEN` 우회 코드는 제거됨 |

---

## ✅ 1. 소셜 로그인 — 설정 2가지 (완료, 2026-08-17)

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
프론트는 별도 작업 없이 바로 동작합니다. `NEXT_PUBLIC_DEV_TOKEN` 우회 코드
(`isDevLoginAvailable`/`startDevSession`, `/auth/mock/[provider]` 라우트)는 실 로그인이
확인돼 전부 제거했습니다. `backendClient.ts`/`scrapStore.ts`도 더는 고정된 개발용 토큰이
아니라 실제 로그인 세션의 access token을 `Authorization` 헤더에 싣습니다(세션이 없으면
헤더 자체를 생략 — skill-service의 `/chat`처럼 비로그인을 허용하는 라우트는 그대로 동작).

### 같이 확인해 주세요
- 프론트는 access/refresh 토큰을 `localStorage`에 저장합니다(키 `skillsns.*`). XSS 노출
  위험이 있어 실서비스 전 **httpOnly 쿠키** 방식으로 옮길지 함께 정해야 합니다.
- user-service가 발급한 토큰을 skill-service가 그대로 검증합니다(JWT_SECRET_KEY 공유 확인
  완료).
- 프론트 로그인 버튼은 카카오·구글 2종만 노출합니다(백엔드도 이제 이 2종만 지원, naver 제거됨).
- 소셜 버튼 로고는 인라인 SVG 근사본이라, 배포 전 카카오/구글 **공식 애셋**으로 교체 필요.

---

## ✅ 2. skill-service가 유휴 상태 후 DB 연결이 끊깁니다 (완료, 2026-08-17)

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

**해결**: `skill-service/main.py`에서 `AsyncPostgresSaver.from_conn_string()`(커넥션 하나를
앱 수명 내내 재사용) 대신 `psycopg_pool.AsyncConnectionPool(check=check_connection)`로
체크포인터를 만들도록 교체. 매 체크아웃마다 살아있는지 확인하고, 죽은 커넥션은 자동
재생성됨. `pg_terminate_backend`로 커넥션을 강제 종료한 뒤 다음 요청이 에러 없이 재연결되는
것으로 검증함. (SQLAlchemy 엔진 쪽은 이미 `NullPool`이라 애초에 이 문제에 해당 안 됨.)

---

## ✅ 3. 프로필 편집 (사진 / 닉네임 / 소개글) (완료, 2026-08-17)

**프론트 상태**: 내 홈(`/home`)과 프로필 편집 화면(`/profile/edit`) 완성. 사진 미리보기,
글자수 제한, 저장 버튼까지 동작합니다. 클라이언트 함수도 준비됨
(`authClient.ts`의 `updateProfile` / `uploadAvatar`).

**붙이는 법**: `src/app/profile/edit/page.tsx`의 `PROFILE_SAVE_ENABLED`를 `true`로 전환 완료.

**해결**: `users` 테이블에 `bio`/`avatar_url` 컬럼 추가, `PATCH /auth/me`(부분 수정),
`POST /auth/me/avatar`(Supabase Storage `avatars` 버킷, public, 5MB 제한, jpeg/png/webp/gif만
허용) 구현. 버킷은 앱 기동 시 없으면 자동 생성. 실제 계정으로 GET/PATCH/업로드까지
전부 end-to-end 테스트 완료.

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
- 저장 위치: Supabase Storage `avatars` 버킷(public), 5MB 제한, jpeg/png/webp/gif만 허용.
- 프론트는 `uploadAvatar` → 받은 URL을 `PATCH /auth/me`에 실어 보내는 순서로 호출합니다.

---

## ✅ 4. 스킬 스크랩 + 폴더 (완료, 2026-08-17)

**프론트 상태**: 기능이 **전부 동작합니다.** `src/lib/scrapStore.ts`가 이제 skill-service의
`/scrap`, `/scrap/folders`를 직접 호출합니다(기기·계정 간 공유됨). 네트워크 왕복을 기다리지
않도록 로컬 캐시를 먼저 낙관적으로 갱신하고, 실패하면 되돌립니다.
- 홈 "스크랩" 탭: 폴더 목록(담긴 개수), 폴더 만들기 / 이름 바꾸기 / 삭제, 폴더 안 스킬 목록
- 스킬 대화 화면(`/skill/[id]`) 우측 상단 🔖 → 폴더 선택 시트(새 폴더 만들어 담기 포함)

**해결**: skill-service에 `ScrapFolder`/`Scrap` 테이블과 아래 라우트 구현
(`app/api/routes/scrap.py`). `Scrap`은 `(user_id, skill_id)` 유니크 제약으로 **한 스킬은
폴더 하나에만** 담기게 강제하고(다시 담으면 폴더 이동), 폴더 삭제는 FK `ondelete="CASCADE"`로
안의 스크랩까지 함께 지웁니다. 폴더 이름은 1~30자, 중복 허용.

```
GET    /scrap/folders                 → [{ id, name, created_at, skill_count }]
POST   /scrap/folders                 { name }            → 생성된 folder
PATCH  /scrap/folders/{folder_id}     { name }            → 수정된 folder
DELETE /scrap/folders/{folder_id}                         → 폴더 + 안의 스크랩 함께 삭제

GET    /scrap                         [?folder_id=]       → [{ skill_id, folder_id, added_at }]
POST   /scrap                         { skill_id, folder_id }  → 담기(이미 있으면 폴더 이동)
DELETE /scrap/{skill_id}                                  → 빼기
```
전부 `Authorization: Bearer <access_token>` 기준의 **사용자별** 데이터입니다(실 로그인
세션의 access token 사용).

---

## ✅ 5. 피드 · 채팅 목록 데이터 (완료, 2026-08-17)

하단 네비의 **피드**와 **채팅 목록** 화면이 붙었습니다. UI·로딩·에러·빈 상태까지 다 되어
있고, 각각 함수 하나가 유일한 교체 지점입니다.

### (1) 피드 (완료, 2026-08-17) — `src/components/feed/feedData.ts`의 `getFeedCards()`
새 **feed-service**(포트 8003)를 만들어 `GET /feed`를 실제로 호출합니다.
`skills`/`users`/`scraps`는 셋 다 같은 Supabase Postgres 인스턴스라, feed-service가 이
테이블들을 **읽기 전용으로 조인**해서 아래 값을 한 번에 내려줍니다(자체 테이블 없음,
`Base.metadata.create_all` 없음 — 스키마는 절대 안 건드림):

| 필드 | 상태 |
|---|---|
| `id`, `title`, `description`, `category` | ✅ `skills` |
| `author_nickname` | ✅ `users` LEFT JOIN (없으면 "알 수 없음") |
| `scrap_count` | ✅ `scraps` 집계 |
| `qa`(대표 질문/답변) | ❌ 저장되는 데이터가 아니라 항상 빈 값. 프론트가 빈 값이면 알아서 숨김 |

- 인증 불필요(공개 목록 — skill-service `GET /skills`와 동일 정책).
- 정렬은 `created_at DESC`(최신순) 고정, `?limit=`만 지원(기본 50). 인기순/페이지네이션은
  아직 없음.
- 상단 "요즘 뜨는 스킬"은 별도 API 없이 `feedData.ts`의 `toTrending()`이 이미 불러온
  카드 중 상위 4개를 뽑아 만듭니다. **정렬 규칙(2026-08-17 확정): 조회수 내림차순,
  조회수가 같으면 스킬 이름 오름차순(가나다순)**. 더 정교한 랭킹(기간별 인기 등)이
  필요해지면 그때 `/feed/trending` 같은 전용 엔드포인트를 고려하면 됩니다.
  - 조회수는 skill-service `skills.view_count` 컬럼 — `GET /skills/{id}`(상세 조회 = 열람)
    호출마다 1씩 늘어납니다. feed-service가 이 컬럼을 그대로 `view_count`로 내려줍니다.

### (2) 채팅 목록 (완료, 2026-08-17) — `src/components/chat_list/chatData.ts`의 `getChats()`
skill-service에 `GET /chat/sessions`를 추가해 실제로 호출합니다.

```
GET /chat/sessions
Authorization: Bearer <access_token>
→ [{ skill_id, skill_title, category, session_id, last_message, last_message_at }]
```
`ChatSession`에 `updated_at` 컬럼을 추가해 메시지가 오갈 때마다 갱신(정렬 기준으로 씀).
`last_message`는 이 테이블이 아니라 LangGraph 체크포인터에서 `get_chat_history`와 동일한
방식으로 꺼내옵니다. `summary`는 만들지 않음 — 프론트가 `Conversation.summary`를 빈
문자열로 두면 `ChatListItem`이 알아서 그 줄을 숨기고 마지막 메시지만 보여줍니다.
`avatar`는 `category`를 skill-creator `CATEGORIES`의 이모지로 매핑해서 프론트가 만듭니다.

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
