# 백엔드 연동 요청 정리

프론트(`frontend/`)에서 백엔드에 요청하는 것들을 **급한 순서대로** 모았습니다.
공통 원칙: **화면은 미리 다 만들어 두고**, API가 생기면 플래그를 켜거나 저장소 구현만
바꾸면 붙도록 해뒀습니다. 각 항목에 "프론트 상태 / 필요한 것 / 붙이는 법"을 적었습니다.

**읽는 순서**: 아래 표로 현황을 보고 → 🔴 / 🟢 / 그 외가 **아직 요청 중인 것**입니다.
완료된 항목은 문서 맨 아래 "아래는 완료된 항목"으로 내려 두었습니다(해결 방법 기록용).

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
| 스킬 삭제 | ✅ `DELETE /skills/{id}` — 내 스킬 목록에서 왼쪽으로 끌면(터치 스와이프 / 마우스 클릭-드래그) 삭제 버튼 노출. **추가 작업 없음** |
| 소셜 로그인 | ✅ CORS/CALLBACK_URL 배선 완료(아래 1번). naver 제거, google/kakao만 지원 |
| 프로필 편집 | ✅ `PATCH /auth/me`, `POST /auth/me/avatar` 구현 완료(아래 3번). `PROFILE_SAVE_ENABLED=true`로 전환함 |
| 스킬 스크랩 + 폴더 | ✅ `GET/POST/PATCH/DELETE /scrap`, `/scrap/folders` 구현 완료(아래 4번). `scrapStore.ts`가 localStorage 대신 API 호출 |
| 피드 | ✅ 신규 feed-service(8003) `GET /feed` 구현 완료(아래 5-1번). `feedData.ts`가 mock 대신 API 호출, 트렌딩 칩도 실데이터에서 파생 |
| 채팅 목록 | ✅ `GET /chat/sessions` 구현 완료(아래 5-2번). `chatData.ts`가 mock 대신 API 호출 |
| LLM 키 (BYOK) | ✅ 스킬 대화·생성 비용을 대화하는 사람 본인의 Anthropic 키로 청구(아래 6번). `PUT/GET/DELETE /me/anthropic-key` |
| 피드 검색 | ⚠️ 프론트에서 불러온 피드 카드 안에서 걸러내는 방식(제목·소개·작성자·카테고리). 스킬이 많아지면 서버 검색 필요 — 아래 항목 참고 |
| 인증 | ✅ 실 로그인 세션의 access token을 그대로 사용. `NEXT_PUBLIC_DEV_TOKEN` 우회 코드는 제거됨 |

---

## ✅ 스킬 만들기 파이프라인 — 남은 것 (전부 해결)

### (1) 이전 단계로 되돌리기 (revert) — ✅ 구현됨
`POST /skills/create/{draft_id}/revert` (multipart, `stage=<what_skill|skill_content|skill_name|skill_test>`)
→ 지정 stage 이후로 누적된 `skill_info`(및 `skill_name` 이하면 `category`도)를 폐기하고,
**새 `thread_id`로** 그 stage를 처음부터 다시 시작한 `CreationResponse`를 준다.
이미 `confirm`된 draft면 `409 DRAFT_ALREADY_CONFIRMED`, `stage` 값이 잘못되면 `422 INVALID_STAGE`.
→ 프론트: `SkillCreator.tsx`의 `EDIT_BACK_ENABLED`를 `true`로, `revertToStage`의
`[백엔드 미구현]` 주석 제거.

### (2) 카테고리를 대화에서 확정 — ✅ 해결됨 (카테고리명 Agent로 대체)
`POST /skills/create`는 이제 category를 **받지 않는다**(빈 draft로 시작). 이름(`skill_name`)이
확정되는 순간 카테고리명 Agent가 스킬 내용을 보고 대/소분류를 자동으로 정해
`skill_info.category`(소분류 id)에 채운다. 실패해도 `confirm` 때 재시도하고, 그래도 안 되면
"미분류"로 저장된다. → 프론트의 `DEFAULT_CATEGORY = "여러 분야"` 우회는 불필요.

### (3) 테스트 리포트 완전성 — ✅ 구현됨
`test_node`가 채점 tool-call 결과를 검사해서, `sampleQuestions`/`diagnosis`/
`benchmark(passRate·time·aiCost)`/`analystNotes` 중 빠진 게 있으면 **채점 LLM에 한 번 다시
요청**한다. 그래도 불완전하면 `_ensure_complete_report()`가 실측치(평균 응답 시간·총 토큰)와
중립값으로 빈 필드를 메우고 `SkillTestOutput`으로 최종 검증한다 — `skill_info.testReport`는
**항상 `test_report.schema.json` 형태를 완전히 갖춘 채** 내려온다.
→ 프론트의 방어 코드는 유지해도 되고 걷어내도 됨(더는 필드가 통째로 빠지지 않음).

### (4) 테스트/개선 단계의 자유 메시지 — ✅ 확인 완료 (처리됨)
`skill_test` / `skill_improve` stage에서 `POST /skills/create/{draft_id}`로 들어온 자유
메시지는 **무시되지 않는다.**
- `skill_test`: 테스트를 돌리기 전 단계라, 자유 메시지는 샘플 질문을 다듬는 대화로 처리된다
  (질문 확정 tool을 부르기 전까지 계속 대화).
- `skill_improve`: 자유 메시지가 개선 지시로 반영된다 — 05 프롬프트가 받아서 해당 영역을
  보완하고 `SkillImproveOutput` tool로 `content.*`를 덮어쓴다.

---

## 그 외 다듬을 거리

- **파일 첨부** — `AttachModal`에서 고른 파일이 `continueDraft`로 전송되고 백엔드가 텍스트를
  추출하지만, 첨부 UX(진행 표시, 실패 처리)는 다듬을 여지가 있습니다.
- ✅ **피드에 작성자 프로필 사진** (구현됨) — `feed.py` 쿼리가 `u.avatar_url AS author_avatar_url`을
  내려주고, `FeedItem.author_avatar_url: Optional[str]`로 응답에 포함됩니다. 프론트는 이미
  이 필드를 읽고 있어 그대로 사진이 뜹니다.
- ✅ **피드 정렬 파라미터 `?sort=`** (구현됨) — `GET /feed?sort=recent|views|scraps`.
  `recent`(기본, `s.created_at DESC`) / `views`(`s.view_count DESC`, 동점 `s.title ASC`) /
  `scraps`(`scrap_count DESC`, 동점 `s.title ASC`). 화이트리스트 밖 값은 `400 INVALID_SORT`.
  파라미터 없으면 기존과 동일(최신순). → 프론트의 "다 받아 재정렬"을 무한스크롤로 되돌릴 수 있음.
- ✅ **카테고리 목록 API `GET /categories`** (구현됨) — skill-service `GET /categories`
  (인증 불필요)가 `[{id, name, emoji, parent_id, skill_count}]` 평면 목록을 준다.
  `parent_id`가 `null`이면 대분류. 정렬은 (대분류 이름 → 그 아래 소분류 이름) 순이라
  대분류 바로 뒤에 자기 소분류가 온다. `skill_count`: 소분류=직접 스킬 수,
  대분류=소속 소분류들의 합.
  - ✅ **대분류가 피드에 안 옴** (구현됨) — `FeedItem.major_category: Optional[str]`로 소분류의
    부모(대분류) 이름을 함께 내려줍니다. 백필 안 된 라벨 스킬이면 `null`.
  - ✅ **정확 필터** (구현됨) — `GET /feed?category=<소분류 id | 소분류 이름 | 대분류 이름>`.
    ILIKE 부분일치가 아니라 정확일치(`s.category = :cat OR c.name = :cat OR cm.name = :cat`)라
    제목·소개에 그 단어가 든 다른 카테고리 스킬이 안 딸려옵니다. `?q=`와 병행 가능.
  → 3가지 모두 준비됐으니 "카테고리별 묶어 보기"를 칩 필터로 전환 가능.
- ✅ **오프닝 턴 자리표시자 `(대화 시작)`를 이력에서 제외** (구현됨) — `chat_sessions`에
  `started_with_opening` 컬럼을 추가하고, 오프닝 턴으로 시작된 세션이면 `GET /chat/{skill}/latest`
  와 `GET /chat/{skill}/{session_id}` 응답에서 **맨 앞 사용자 메시지(자리표시자)를 서버가 뺀다.**
  구체 문구가 아니라 "이 세션이 오프닝으로 시작됐다"는 사실에만 의존한다.
  → 프론트의 `stripOpeningPlaceholder` 필터를 걷어내도 됨.
- ✅ **오프닝 턴만 있는 빈 대화 세션 감추기** (구현됨) — `GET /chat/sessions`가
  `started_with_opening`이면서 메시지가 2개 이하(자리표시자 + 스킬 인사)인 세션은 목록에서
  제외한다. 사용자가 실제로 첫 메시지를 보내면(`continue_chat`) 그때부터 목록에 나타난다.
  → 프론트의 `untouched` 재사용 로직은 유지해도 되고 걷어내도 됨(세션 자체는 여전히 생성되지만
  목록엔 안 뜸). 세션을 아예 안 만드는 방식(`/opening` 경로)은 채택하지 않음.
- **스킬 수정에서 카테고리도 바꾸게 해주세요** — `PATCH /skills/{id}`를 그대로 써서 스킬 수정
  화면(`/skill/[id]/edit`)을 붙였습니다. `title`·`description`·`md_content`는 잘 저장되는데
  `SkillUpdate` 스키마에 `category`가 없어서 보내도 조용히 무시됩니다. 그래서 지금 화면에서는
  카테고리를 **읽기 전용 + "아직 바꿀 수 없어요"** 로 표시해 뒀습니다.
  `SkillUpdate`에 `category: Optional[str]` 한 줄만 추가되면 프론트에서 입력 UI를 바로
  열겠습니다(등록 화면 `/skill/new`의 카테고리 선택 UI를 그대로 재사용합니다).

---

# 아래는 완료된 항목 (참고용)

이미 구현돼 동작하는 것들입니다. 무엇을 어떻게 해결했는지 기록으로 남겨 둡니다.

## ✅ 1. 소셜 로그인 — 설정 2가지 (완료, 2026-08-17 · 카카오는 아래 8번 참고)

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

---

## ✅ 6. LLM 키를 사용자 본인이 등록해서 쓰도록 변경 (BYOK) (완료, 2026-08-21)

토이 프로젝트라 여러 명이 같이 쓰는데, 서버 공용 Anthropic 키 하나로는 크레딧이 금방
마릅니다(실제로 겪음). **원칙: 대화하는 사람이 자기 키로 비용을 낸다.** 스킬을 만든
사람이 아니라 그 순간 대화/생성을 실행하는 사람 기준입니다.

**저장 방식**: 처음엔 브라우저 localStorage 안만 고려했는데, "로그인만 하면 어느
기기·브라우저에서든 다시 입력 안 해도 되게" 요구사항이 있어서 **서버(skill-service)에
계정(user_id) 단위로 암호화 저장**하는 걸로 바꿨습니다.

```
GET    /me/anthropic-key    → { has_key: boolean }         (평문은 절대 안 돌려줌)
PUT    /me/anthropic-key    { api_key }  → 등록/교체
DELETE /me/anthropic-key    → 삭제
```
- 새 테이블 `user_secrets(user_id, anthropic_api_key_encrypted, updated_at)` — skill-service
  소유, `Fernet`(대칭키) 암호화. 암호화 키는 `SECRET_ENCRYPTION_KEY` 환경변수
  (`Fernet.generate_key()`로 발급, `JWT_SECRET_KEY`와 동급으로 취급 — 유출되면 저장된 모든
  사용자 키가 복호화 가능해짐).
- 프론트는 이제 이 키를 매 요청 실어 보내지 않습니다 — `/chat/*`, `/skills/create/*`
  호출 시 skill-service가 JWT의 `user_id`로 DB에서 직접 찾아 씁니다.
- 등록 안 했으면: `/chat/*`은 "먼저 프로필에서 본인 Anthropic API 키를 등록해주세요"
  안내만 반환(로그인 안 했을 때와 같은 패턴, LLM 호출 안 함). `/skills/create/*`는
  400 `ANTHROPIC_KEY_REQUIRED`.
- 프로필 편집 화면(`/profile/edit`)에 입력창 추가 — 평문이 안 내려오니 항상 빈칸으로
  시작하고 등록 여부만 placeholder로 보여줌, 빈칸으로 저장하면 기존 값 유지(안 건드림).
- 서버 로그(uvicorn 기본 access log)에 이 값이 안 찍히는 것 확인함.

**남은 보안 트레이드오프**: DB와 `SECRET_ENCRYPTION_KEY`(환경변수)가 **동시에** 털리면
암호화가 무력화됩니다 — 별도 KMS 없이 앱 자체 대칭키만 쓰는 수준이라, 토이 프로젝트
규모에서 적절한 선이지 프로덕션급 시크릿 매니지먼트는 아닙니다.

---

## ✅ 7. 피드 서버 검색·페이징 + 대화 이어보기 (완료, 2026-08-23)

Ivy가 백엔드를 만들고 프론트가 붙였습니다. 요청했던 "피드 검색 API"는 이 항목으로 대체됩니다.

- `GET /feed?q=&limit=&offset=` — 제목·소개·카테고리·작성자 닉네임을 ILIKE로 검색 + 페이징.
  프론트: `feedData.ts`의 `getFeedCards({q, limit, offset})`가 `{cards, hasMore}`를 반환하고,
  `SkillFeed.tsx`가 300ms 디바운스 검색 + IntersectionObserver 무한 스크롤로 씁니다.
  클라이언트 필터(`matches()`)는 제거했습니다.
- `GET /chat/{skill_id}/latest` — 그 스킬과 나눈 최근 세션 복원. 이력이 없으면 null.
  프론트: `getLatestChatSession()`을 `getSkill()`과 함께 기다려 대화를 복원합니다.
  **인사말("무엇을 도와드릴까요?")은 프론트가 만드는 메시지라 서버 이력에 없어서**,
  복원할 때 맨 앞에 다시 붙입니다(안 붙이면 대화가 중간부터 시작한 것처럼 보입니다).

---

## ✅ 8. 카카오 로그인 (완료, 2026-08-23)

**해결됨** — Ivy가 저장소 밖(카카오 개발자센터 / Supabase 대시보드) 설정에서 고쳤다고
전달받았습니다. 코드 커밋은 없습니다(원인이 설정이었으니 예상과 맞습니다).

프론트에서 확인한 것: `GET /auth/login/kakao`가 200으로 `provider=kakao`,
`redirect_to=http://localhost:3000/auth/callback`인 로그인 URL을 정상 발급합니다.
다만 **끝까지(카카오 화면 → 콜백 → /home) 실제로 로그인해 본 검증은 아직입니다** —
전체 흐름은 실제 계정으로 한 번 눌러봐야 확실합니다. 아래는 당시 조사 기록입니다.

<details>
<summary>당시 증상과 조사 내용 (참고용)</summary>


**증상**: 로그인 화면에서 카카오를 누르면 카카오 로그인 화면까지는 뜨는데, 그 뒤로 우리 앱에
돌아오지 못합니다. **구글은 같은 경로로 정상 동작**합니다(실제 로그인 성공, 그 계정으로
스킬 생성·프로필 수정까지 확인).

**확인한 사실 — 프론트/CORS/콜백 배선 문제는 아닙니다.**
user-service 로그를 보면 카카오는 **콜백이 아예 호출되지 않습니다**:
```
GET /auth/login/kakao    200 OK      ← 로그인 URL 발급은 됨
GET /auth/login/google   200 OK
GET /auth/callback?code= 200 OK      ← 구글만 돌아옴
```
즉 실패 지점이 **카카오 개발자센터 또는 Supabase 쪽 설정**입니다.

**브라우저에서 확인한 실제 카카오 요청 값**
```
client_id     = c9f747a17663cf56959a0eb2a484ae8e
scope         = account_email profile_image profile_nickname
redirect_uri  = https://twumveupobzimkkiqlim.supabase.co/auth/v1/callback
```

**확인 부탁드릴 곳** (카카오 개발자센터 → 내 애플리케이션)
1. **동의항목** — Supabase가 `account_email`을 요구합니다. 카카오는 이메일 수집에 동의항목
   활성화(경우에 따라 비즈 앱 등록)가 필요합니다. [카카오 로그인 → 동의항목]의
   **카카오계정(이메일)** 상태 확인. ← 가장 의심되는 지점
2. **Redirect URI** — [카카오 로그인 → Redirect URI]에 위 `redirect_uri`
   (`https://…supabase.co/auth/v1/callback`)가 등록돼 있는지.
3. **카카오 로그인 활성화** 스위치 ON 여부.
4. Supabase 대시보드 → Authentication → Providers → Kakao의 client id/secret.

카카오 화면에 뜨는 **에러 코드(KOE___)** 를 알려주시면 원인을 더 좁힐 수 있습니다
(KOE006=Redirect URI 미등록 / 동의항목 관련 / KOE101·KOE004=앱 설정).

**프론트는 별도 작업이 없습니다** — 설정이 맞춰지면 구글과 동일한 경로로 동작합니다.
(카카오가 계속 막히면 로그인 화면에서 카카오 버튼을 잠시 감추는 것도 방법입니다 — 원하시면 말씀해 주세요.)

---

</details>

---

