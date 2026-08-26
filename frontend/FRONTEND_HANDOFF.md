# Frontend Handoff

> **✅ 세 가지 모두 처리 완료 (2026-08-23, frontend 브랜치)**
>
> | # | 항목 | 결과 |
> |---|---|---|
> | 1 | 피드 검색·페이징 서버 사이드 | ✅ 붙임 — 클라이언트 필터 `matches()` 제거, 300ms 디바운스 + 무한 스크롤 |
> | 2 | 채팅 이어보기 | ✅ 붙임 — 단, **인사말은 다시 붙입니다** (아래 참고) |
> | 3 | 마이페이지 사진·소개글 하드코딩 | ✅ 이미 처리돼 있었음 (핸드오프 작성 시점엔 미푸시 상태였습니다) |
>
> 각 항목 아래에 무엇을 어떻게 붙였는지 적어두었습니다.
> 아래 본문은 Ivy가 요청할 때 쓴 원문 그대로이고(계약 확인용), 각 항목 끝에
> **처리 결과**를 덧붙였습니다.

## ✅ 1. 스킬피드 검색 + 페이징을 서버 사이드로 전환 — 완료

**현재 상태**: `frontend/src/components/feed/SkillFeed.tsx`가 `getFeedCards()`로 전체 피드를
한 번에 불러온 뒤, 입력한 검색어를 브라우저에서 `Array.filter`로 걸러내고 있음
(`matches()` 함수, 제목/소개/작성자/카테고리 라벨을 합쳐서 `includes()`). 페이징은 아예 없음
(한 번에 전부 로드).

**백엔드 준비 완료**: `feed-service`의 `GET /feed`가 이제 `q`(검색어)와
`limit`/`offset`(페이징) 쿼리 파라미터를 받음.

```
GET /feed?q=검색어&limit=20&offset=0
```

- `limit` 기본값 20, `offset` 기본값 0 — 한 페이지 20개씩
- `q` 생략 시: 검색 없이 최신순 페이징만
- `q` 있을 때: DB에서 `title`, `description`, `category`, 작성자 `nickname`에
  대해 대소문자 무시 부분일치(`ILIKE`)로 필터링 후 동일하게 페이징
- 응답 스키마는 기존 `GET /feed`와 동일 (`FeedItem[]`, 배열 그대로) — 총 개수는 안 내려주므로
  **응답 길이가 `limit`보다 작으면 마지막 페이지**로 판단하면 됨 (`hasMore = items.length === limit`)

**할 일**:
- `frontend/src/components/feed/feedData.ts`의 `getFeedCards()`(또는 관련 API 호출부)가
  `q`, `limit`(기본 20), `offset`(기본 0)을 인자로 받아 `/feed?...`로 요청하도록 수정
- `SkillFeed.tsx`:
  - 검색어 바뀔 때마다(디바운스 권장) `offset=0`으로 재요청 — 현재처럼 마운트 시 1회만
    불러와서 클라이언트에서 거르는 방식은 제거
  - 스크롤 끝에 도달하면(또는 "더 보기" 버튼) `offset += limit`로 다음 페이지 요청 후
    기존 목록에 append, `hasMore`가 `false`면 더 이상 요청 안 함
- `matches()` 함수와 관련 클라이언트 필터링 로직 제거
- "요즘 뜨는 스킬" 트렌딩 섹션은 검색 중엔 숨기는 기존 동작 유지하면 됨 (로직상 `q` 유무로
  분기하던 것만 서버 응답 유무 기준으로 바꾸면 됨)

**처리 결과 (2026-08-23)**
- `feedData.ts`: `getFeedCards({ q, limit = 20, offset = 0 })` → `{ cards, hasMore }` 반환.
  `hasMore`는 안내대로 `items.length === limit`으로 판정합니다.
- `SkillFeed.tsx`: 검색어 300ms 디바운스 후 `offset=0` 재요청, 목록 끝의 감시 지점을
  `IntersectionObserver`로 보고 다음 페이지를 append. `matches()` 클라이언트 필터는 삭제했습니다.
- 트렌딩은 "검색 결과 상위"가 아니라 "전체 상위"여야 해서 마운트 시 1회 따로 받아둡니다.
  검색 중 숨기는 동작은 그대로입니다.
- 확인: `/feed?limit=20&offset=0&q=영어` 요청이 나가고, 결과·빈 결과·검색어 삭제 후 복귀까지
  실제 브라우저로 검증했습니다.

---

## ✅ 2. 채팅 이어보기 (이전 대화 이어서 하기) — 완료

**현재 상태**: `frontend/src/components/skill-usage/SkillUsageChat.tsx`가 마운트될 때
이전 세션을 조회하지 않고 항상 새 대화로 시작함 (`sessionIdRef`가 항상 `null`로 시작).
채팅목록(`/chats`)에는 지난 대화들이 잘 뜨지만, 막상 스킬 채팅창에 들어가면 대화 내역이
매번 리셋된 것처럼 보이는 원인.

**백엔드 준비 완료**: `skill-service`에 `GET /chat/{skill_id}/latest` 추가됨.

```
GET /chat/{skill_id}/latest
Authorization: Bearer <access_token>
```

- 로그인한 유저가 해당 스킬과 나눈 가장 최근 세션을 찾아서, 그 세션의 메시지 이력을 복원해 반환
- 응답 (`ChatHistoryResponse`):
  ```json
  {
    "session_id": "...",
    "skill_id": "...",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```
- 대화 이력이 없으면 본문이 `null` (200 OK) — 새 대화 시작 신호로 쓰면 됨
- 인증 안 됐으면 401

**할 일**:
- `frontend/src/lib/backendClient.ts`에 `getLatestChatSession(skillId)` 같은 함수 추가
  (`GET /chat/{skillId}/latest` 호출, `null`이면 `null` 반환)
- `SkillUsageChat.tsx`의 마운트 `useEffect`(35~53번 줄)에서 `getSkill`과 함께 이 함수를 호출:
  - 결과가 있으면: `sessionIdRef.current = session_id`로 세팅하고, `messages`를 `role`에 맞춰
    변환해서 `setMessages`로 채움 (웰컴 메시지는 생략)
  - 결과가 `null`이면: 지금처럼 웰컴 메시지만 띄우고 새 대화로 시작
- 이후 `handleSend`의 기존 분기(`sessionIdRef.current ? continueChat : startChat`)는 그대로
  두면 됨 — 이어하기든 새 시작이든 자연스럽게 맞물림

**처리 결과 (2026-08-23)**
- `backendClient.ts`에 `getLatestChatSession(skillId)` 추가. 실패·비로그인 시 `null`을 돌려
  새 대화로 시작합니다.
- `SkillUsageChat.tsx`: `getSkill()`과 **`Promise.all`로 함께** 기다립니다. 따로 하면 인사말이
  떴다가 지난 대화로 교체되는 깜빡임이 생깁니다.
- ⚠️ **안내와 한 가지 다르게 했습니다**: "웰컴 메시지는 생략" 대신 **인사말을 맨 앞에 다시
  붙입니다.** 인사말은 프론트가 만드는 메시지라 서버 이력에 없는데, 생략하면 사용자에게는
  대화가 중간부터 시작한 것처럼 보입니다(실제로 그렇게 보고되어 고쳤습니다).
- 확인: 서버 이력 4개 + 인사말 = 화면 말풍선 5개, 채팅 목록에서 진입하는 경로로 검증했습니다.

---

## ✅ 3. 마이페이지(`/home`) 프로필 사진·소개글이 하드코딩됨 — 완료(이미 처리됨)

**현재 상태**: `frontend/src/app/(main)/home/page.tsx:84-93`에서 프로필 사진 자리는 항상
고정 이모지 `🙂`, 소개글은 항상 고정 문구 `"아직 소개가 없어요"`만 보여줌 — `user.avatar_url`,
`user.bio` 값을 아예 안 읽음. 주석에 "프로필 사진은 아직 백엔드에 필드가 없어 기본 아바타로
둔다"라고 되어 있는데, 이건 예전(백엔드에 필드 없던 시절) 주석이 안 지워진 것 — 지금은
`/auth/me` 응답(`UserInfo` 타입, `frontend/src/lib/authClient.ts`)에 `avatar_url`/`bio`가
이미 들어있고, 가입 시 카카오/구글 기본 프로필 사진도 채워주도록 백엔드가 구현되어 있음.
그래서 실제로는 사진·소개글이 있는 유저도 마이페이지에선 항상 빈 상태로 보임.

**할 일**: `profile/edit/page.tsx`에 이미 같은 문제를 처리하는 패턴이 있으니(`shownAvatar`,
82~191번 줄, `<img>` 있으면 이미지 없으면 이모지 fallback) 그대로 가져다 쓰면 됨.
- `home/page.tsx`의 `user`(`getStoredUser()`)에서 `user?.avatar_url`을 읽어서, 있으면
  `<img src={user.avatar_url} className="h-full w-full rounded-full object-cover" />`로,
  없으면 지금처럼 `🙂` 이모지로 표시
- `user?.bio`가 있으면 그 값을, 없으면 지금 문구(`"아직 소개가 없어요"`) 그대로 표시
- 오래된 `// 프로필 사진은 아직 백엔드에 필드가 없어...` 주석 제거
- 참고: `getStoredUser()`는 로그인 시점 캐시라, 프로필 편집 화면에서 저장하면
  `updateStoredUser()`로 캐시가 갱신되므로 마이페이지 재방문 시 최신값이 반영됨 (이미 되어 있음,
  추가 작업 불필요)

**처리 결과 (2026-08-23)**
- 이 항목은 핸드오프를 쓰신 시점에 이미 고쳐져 있었습니다 — 그때 `frontend` 브랜치가
  아직 푸시 전이라 develop에서는 안 보였습니다. `home/page.tsx`가 `user.avatar_url`,
  `user.bio`를 읽고 있고 옛 주석도 지워져 있습니다.
- 사진은 `next/image` 대신 `<img>`를 씁니다 — Supabase 스토리지 호스트가 환경마다 달라서
  `remotePatterns`에 박아두기 어렵습니다.

---

## ✅ 4. 키 없는 사용자에게 계정당 평생 3회 무료 체험 — 완료 (2026-08-26)

**배경**: 본인 Anthropic 키를 등록해야만 대화·스킬 생성이 되니, 처음 온 사람이 키부터
등록해야 해서 그냥 이탈하는 경우가 있었습니다. 계정당 평생 3회(스킬 생성 + 대화 합산)
까지는 서버 기본 키로 무료로 써볼 수 있게 했습니다.

**API 계약은 안 바뀝니다** — 프론트에서 별도로 호출할 새 엔드포인트나 헤더는 없습니다.
지금처럼 그냥 `/chat/*`, `/skills/create/*`를 호출하면 되고, 서버가 내부적으로
"본인 키 있으면 그거, 없으면 무료 한도 안에서 서버 기본 키, 다 썼으면 막기"를 처리합니다.

- 무료 한도 안에 있을 때: 지금과 똑같이 정상 응답(`reply`/`CreationResponse`)이 옵니다.
  프론트 입장에선 "키가 있는 사람"과 구분할 방법이 없고, 구분할 필요도 없습니다.
- 한도(3회)를 다 썼을 때:
  - `/chat/*`: 기존과 같은 모양(`{ session_id: null, reply: "..." }`)이되, 문구가
    바뀌었습니다 — `"무료로 대화할 수 있는 횟수를 다 썼어요. 계속하려면 프로필에서
    본인 Anthropic API 키를 등록해주세요."` 문구를 화면에 그대로 노출하고 있다면
    자연스럽게 바뀐 문구로 보일 뿐, 처리 로직 변경은 필요 없습니다.
  - `/skills/create/*`: 기존과 동일하게 400 `ANTHROPIC_KEY_REQUIRED`. 지금 이 에러를
    "키를 등록해주세요" 안내로 처리하고 있다면 그대로 두면 됩니다 — 다만 이제 이 에러가
    "키가 아예 없어서"가 아니라 "무료 체험을 다 써서"일 수도 있으니, 안내 문구에
    "무료로 3번까지 써보실 수 있어요" 같은 뉘앙스를 넣고 싶으면 말씀해주세요.

**프론트에서 필요하면 요청해주세요**: 지금은 "몇 번 남았는지"를 알려주는 필드가 없습니다
(`GET /me/anthropic-key`는 키 등록 여부만 반환). "무료 2/3회 남음" 같은 걸 화면에 보여주고
싶으면 그 응답에 `free_turns_remaining` 같은 필드를 추가해드릴 수 있어요.

---

## 새로 드리는 요청

프론트를 붙이면서 백엔드에 필요한 것이 생겼습니다. 상세는 `BACKEND_HANDOFF.md`에 적었습니다.

- **피드에 작성자 프로필 사진** — `GET /feed`가 `author_nickname`만 주고 사진 URL을 안 줍니다.
  `feed.py`의 쿼리가 이미 `LEFT JOIN users u`를 하니 `u.avatar_url`을 하나 더 뽑아
  `FeedItem.author_avatar_url`로 내려주시면 됩니다. 프론트는 이미 읽도록 붙여뒀습니다.
- **스킬 수정에서 카테고리 변경** — `SkillUpdate`에 `category`가 없어 수정 화면에서
  읽기 전용으로 두었습니다.
