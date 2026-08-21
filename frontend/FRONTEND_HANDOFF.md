# Frontend Handoff

백엔드 작업은 끝났고, 아래 두 가지는 프론트에서 아직 안 붙인 상태입니다.

## 1. 스킬피드 검색 + 페이징을 서버 사이드로 전환

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

## 2. 채팅 이어보기 (이전 대화 이어서 하기)

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
