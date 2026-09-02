# frontend — 기술 설계

- **포트**: 3000 (dev는 점유 시 자동으로 3001…)
- **책임**: 사용자가 보는 모든 화면. 세 백엔드 서비스를 브라우저에서 직접 호출한다.
- **스택**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5 · Tailwind CSS 4
- **디자인 시스템**: [`../../frontend/design.md`](../../frontend/design.md) ("Structured Green", 라이트 모드 전용, IBM Plex 패밀리)
- **연동 계약**: [`../frontend-integration.md`](../frontend-integration.md), `frontend/BACKEND_HANDOFF.md`

> `frontend/AGENTS.md` 주의: 이 프로젝트의 Next.js는 학습 데이터와 다른 breaking change가
> 있을 수 있어, 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 볼 것.

---

## 1. SW 구조

```
frontend/
├── next.config.ts          # output: "standalone" (도커 배포용)
├── Dockerfile              # node:22-slim 3-stage(deps→builder→runner). runner에 ENV HOSTNAME="0.0.0.0"
├── package.json            # 런타임 의존성은 next/react/react-dom/jszip 뿐 (UI 라이브러리 없음)
└── src/
    ├── app/                        # App Router
    │   ├── layout.tsx              # 루트 레이아웃. IBM Plex 폰트 3종 로드, <html lang="ko">, metadata(토마토)
    │   ├── globals.css             # Tailwind 4 + 디자인 토큰(:root CSS 변수) + @theme inline 매핑
    │   ├── page.tsx                # 진입점 — 화면을 안 그리고 로그인 여부로 /home | /login 리다이렉트
    │   ├── login/page.tsx          # 카카오/구글 로그인 버튼
    │   ├── auth/callback/          # OAuth 리다이렉트 착지 — code를 토큰으로 교환 후 저장
    │   ├── (main)/                 # 하단 네비 공유 그룹 (AuthGate로 감쌈)
    │   │   ├── layout.tsx          #   폰 목업 프레임 + <BottomNav>
    │   │   ├── home/page.tsx       #   내 스킬 / 스크랩 탭
    │   │   ├── feed/page.tsx       #   피드 (검색 + 무한 스크롤)
    │   │   └── chats/page.tsx      #   채팅 목록
    │   ├── create/page.tsx         # 스킬 생성 진입(카테고리/시작)
    │   ├── skill/new/page.tsx      # "내 스킬 넣기" — 기존 프롬프트를 그대로 등록
    │   └── skill/[slug]/           # 게시된 스킬과 대화 (+ /edit 수정 폼)
    │       └── page.tsx            #   searchParams(from/new/session)로 대화 모드 결정 → <SkillUsageChat>
    ├── components/
    │   ├── auth/AuthGate.tsx       # 세션 없으면 /login. useSyncExternalStore로 "확인 전/후" 표현
    │   ├── nav/                    # BottomNav, BackButton
    │   ├── skill-creator/          # 생성 파이프라인 UI (SkillCreator, StepProgress, ChatBubble,
    │   │                           #   CategoryGrid, CandidatePicker, TestReport, PackagedResult, ...)
    │   ├── skill-usage/            # SkillUsageChat(대화), EditSkillForm, ScrapButton
    │   ├── feed/                   # SkillFeed, FeedCard
    │   ├── chat_list/              # ChatList, ChatListItem
    │   ├── home/                   # ScrapTab, CreateSkillSheet
    │   └── common/                 # Markdown, CategoryChip, SwipeableRow, markdownText
    └── lib/                        # ★ 백엔드 연동 계층 (아래 3절)
        ├── authClient.ts           # user-service(/auth/*) + 토큰 보관/자동 갱신
        ├── backendClient.ts        # skill-service(/skills, /chat, /skills/create/*)
        ├── anthropicKey.ts         # skill-service(/me/anthropic-key) — BYOK
        └── scrapStore.ts           # skill-service(/scrap*) + 낙관적 로컬 캐시(useSyncExternalStore)
```

### 렌더링 모델

- **거의 전부 클라이언트 컴포넌트(`"use client"`)**. 로그인 상태가 `localStorage`에
  있어 서버에서 알 수 없으므로, 데이터 패칭도 대부분 브라우저에서 `fetch`로 한다.
  `skill/[slug]/page.tsx`만 async 서버 컴포넌트로 `params`/`searchParams`를 풀어
  클라이언트 `<SkillUsageChat>`에 넘긴다.
- **App Router 레이아웃 중첩**: `app/layout.tsx`(폰트·html) → `app/(main)/layout.tsx`
  (`<AuthGate>` + 폰 목업 프레임 + `<BottomNav>`). `(main)` 밖 화면(로그인, 스킬 생성,
  스킬 대화)은 각자 `<AuthGate>`를 직접 쓰거나(로그인 불필요 화면은 안 씀) 프레임을 직접 그린다.
- 상태 관리 라이브러리 없음. 서버 상태는 `lib/*`의 모듈 스코프 캐시 +
  `useSyncExternalStore`(scrapStore), 화면 상태는 `useState`.

### 레이아웃 규칙 (design.md)

모바일 우선. `sm:` 미만에서는 엣지투엣지(테두리·그림자·라운드·max-width 없음).
`sm:` 이상에서만 폰 목업 프레임(`max-w-[390px]`, `h-[720px]`, `rounded-[20px]`)을
복원 — 데스크톱에서 개발·미리보기 편하라고 두는 반응형 분기이지 프로덕션 모바일
스타일이 아니다. 라운드 계층: input 8px · card 12–14px · 챗버블/모달 20px · 버튼/아바타 full.

---

## 2. 화면 흐름

```
/  (page.tsx)
 ├─ 세션 없음 → /login → [카카오|구글] → getSocialLoginUrl → 제공자 로그인
 │                     → /auth/callback?code=… → exchangeCodeForToken → saveSession → /home
 └─ 세션 있음 → /home

/(main)/home        내 스킬 목록 / 스크랩 탭. "스킬 만들기" 시트 → /create 또는 /skill/new
/(main)/feed        공개 스킬 피드 (feed-service). 카드 클릭 → /skill/{id}?new=1
/(main)/chats       내 대화 목록 (skill-service /chat/sessions). 항목 클릭 → /skill/{id}?session={sid}

/create             AI와 함께 스킬 만들기 → SkillCreator (draft_id 기반 5단계) → 확정 → /skill/{id}?from=create
/skill/new          내 프롬프트를 그대로 등록 (createSkillDirect) → /skill/{id}?from=create

/skill/[slug]       게시된 스킬과 대화 (SkillUsageChat)
     ?from=create   방금 만들고 왔다 → 뒤로가기를 /chats로
     ?new=1         둘러보다 들어왔다 → 지난 대화 잇지 않고 새 대화로 시작
     ?session=<id>  채팅 목록에서 고른 '그 대화'를 연다
/skill/[slug]/edit  내 스킬 수정 폼 (제목/설명/본문 — 카테고리는 자동 관리라 제외)
```

---

## 3. 백엔드 연동 계층 (`src/lib/`)

화면 컴포넌트는 백엔드 URL을 직접 모른다 — `lib/*`의 함수만 부른다.
서비스 URL은 빌드 타임 환경변수로 주입된다.

| 파일 | 대상 서비스 | 환경변수 | 역할 |
|---|---|---|---|
| `authClient.ts` | user-service | `NEXT_PUBLIC_USER_SERVICE_URL` | 로그인 2단계, 토큰 보관, **자동 갱신** |
| `backendClient.ts` | skill-service | `NEXT_PUBLIC_BACKEND_URL` | 스킬 CRUD, 대화, 생성 파이프라인 |
| `anthropicKey.ts` | skill-service | `NEXT_PUBLIC_BACKEND_URL` | BYOK 키 등록/조회/삭제 |
| `scrapStore.ts` | skill-service | `NEXT_PUBLIC_BACKEND_URL` | 스크랩 — 낙관적 캐시 |

(feed-service는 `NEXT_PUBLIC_FEED_SERVICE_URL`. 프론트가 세 URL을 각각 들고 직접 호출 — 게이트웨이 없음.)

### 3.1 토큰 보관과 자동 갱신 (`authClient.ts`)

- access/refresh/user를 `localStorage`에 둔다(`skillsns.*`). XSS 노출 방식이라 실서비스
  전엔 httpOnly 쿠키로 옮겨야 함 — `BACKEND_HANDOFF.md`에 명시.
- **`getFreshAccessToken()`**: 인증이 필요한 모든 요청이 이걸로 토큰을 얻는다. access
  JWT의 `exp`(서명 검증 없이 payload만 디코드)를 보고 만료 1분 전이면 미리
  `POST /auth/refresh`로 새 access token을 받는다. 동시 요청이 겹쳐도 실제 갱신 호출은
  1회만 나가게 in-flight promise를 공유. refresh까지 죽으면 세션을 비워
  `AuthGate`가 `/login`으로 보낸다.
- 401을 보고 재시도하는 대신 **선제 갱신** — 대화 API는 만료돼도 401이 아니라
  "로그인이 필요합니다" 문구가 와서 원인 파악이 어렵기 때문.

### 3.2 에러 흡수

`backendClient.ts` / `authClient.ts`는 백엔드가 `detail`로 주는 코드성 문자열 중
사용자에게 그대로 보이면 안 되는 것만(`ANTHROPIC_KEY_REQUIRED`, `INVALID_FILE_TYPE` 등)
한국어 안내로 치환하고(`DETAIL_MESSAGES`), 나머지는 `detail`을 그대로 노출한다.
skill-service가 대화 오류를 200 + 안내 문구로 흡수하는 방침과 짝을 이룬다.

### 3.2a 스킬 본문 base64 전송 (Cloudflare WAF 우회)

스킬 본문에 HTML 태그·쉘 명령이 잔뜩이면 Render 앞단 Cloudflare WAF가 요청을 403(`Blocked`)으로
끊고, 그 응답엔 CORS 헤더가 없어 브라우저엔 `Failed to fetch`로만 뜬다(README 11.9). WAF 설정은
못 바꾸므로, `backendClient.ts`의 `toBase64Utf8()`가 본문을 base64로 감싸 보내고
(`content_encoding="base64"` / multipart는 `message_encoding="base64"`) skill-service가 받아서
평문으로 되돌린다. 적용 경로: `createSkillDirect`(`POST /skills`), `updateSkill`(`PATCH /skills/{id}`),
`continueDraft`(`POST /skills/create/{draft_id}`).

### 3.3 스크랩 낙관적 캐시 (`scrapStore.ts`)

폴더/스크랩을 모듈 스코프 캐시에 두고 `useSyncExternalStore`로 구독한다. 변경(담기·폴더
생성 등)은 **캐시를 먼저 낙관적으로 갱신**하고 백엔드 호출은 뒤에서 진행, 실패하면
캐시를 롤백한다. 임시 id(`tmp-…`)는 서버 응답으로 실제 id로 교체. 폴더 삭제는 그 안의
스크랩도 함께 정리(백엔드도 `ON DELETE CASCADE`로 동일).

### 3.4 스킬 생성 파이프라인 UI (`components/skill-creator/`)

`backendClient.ts`의 `startDraft` → `continueDraft`/`improveDraft`/`retestDraft`/
`revertToStage` → `confirmDraft`가 skill-service의 `draft_id` 기반 계약을 그대로 따른다.
응답의 `stage` / `skill_info` / `choices` / `summary`로 `StepProgress`(도트 스테퍼)와
현재 단계 UI(카테고리 그리드 · 챗 · 이름 후보 카드 · 테스트 리포트 · 패키징 카드)를 그린다.
`continueDraft`는 `FormData`로 메시지 + 첨부 파일을 함께 보낸다.

### 3.5 스킬 대화 (`components/skill-usage/SkillUsageChat.tsx`)

- 진입 시 `getLatestChatSession(skillId)`(또는 `?session=`이면 `getChatSession`)로 지난
  대화를 복원. `?new=1`이면 복원을 건너뛴다.
- 이력이 없으면 `startChat(skillId)`(message 없이) → **오프닝 턴**(스킬이 먼저 자기소개 +
  첫 질문). 이후 `continueChat(skillId, sessionId, message)`.
- `OPENING_PLACEHOLDER`(`"(대화 시작)"`) 자리표시자는 이력 맨 앞 사용자 메시지에서만 제거.
- 응답 마크다운은 `components/common/Markdown.tsx`로 렌더, 채팅 목록 미리보기는
  `markdownText.ts`로 기호를 벗겨 평문화.

---

## 4. 스타일 시스템 (`globals.css`)

- Tailwind CSS 4 (`@import "tailwindcss"` + `@theme inline`). 별도 `tailwind.config`
  파일 없음 — 디자인 토큰을 `:root` CSS 변수로 정의하고 `@theme inline`에서 Tailwind
  색/폰트 유틸로 매핑(`--color-primary: var(--primary)` 등).
- 팔레트는 단일 그린 액센트(`--primary: #56a67f`), 배경 `#fafaf7` / surface `#fff` /
  surface-2 `#f0f2ee`, ink `#1e231f`. **라이트 모드 전용**(다크 미지원).
- 폰트: `app/layout.tsx`에서 `next/font`로 IBM Plex Serif(워드마크) · Plex Mono(기술 라벨)
  는 Google, **Plex Sans KR은 `src/fonts/`의 로컬 woff2**(본문·UI 대부분). 한글 폰트는
  프로덕션에서 전체 서브셋 파이프라인이 필요 — design.md 참고.

---

## 5. 빌드 & 배포

- `next.config.ts` → `output: "standalone"`. Dockerfile 3-stage(node:22-slim):
  `deps`(npm ci) → `builder`(`NEXT_PUBLIC_*`를 `ARG`/`ENV`로 받아 `npm run build`) →
  `runner`(`.next/standalone` + static + public 복사, `node server.js`).
- **runner에 `ENV HOSTNAME="0.0.0.0"`** — Next standalone 서버가 컨테이너 호스트명에만
  바인딩되면 Render 프록시 네트워킹에서 502가 난다(README 11.1절).
- `NEXT_PUBLIC_*`는 **빌드 타임에 인라인**되므로 `render.yaml`에서 build ARG로 넘긴다.
- Render `env: docker`, `branch: develop`, `autoDeploy: false`. `main` push 시
  Vercel 자동 배포도 병행 가능(`render.yaml`의 `CORS_ORIGINS`에 두 도메인 모두 포함).
  파이프라인 상세는 [`../tech-decisions.md`](../tech-decisions.md) 9절.
