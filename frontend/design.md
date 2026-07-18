# Design System — skillsns

## Product Context
- **What this is:** 대화형 "질문 Agent"와의 심층 인터뷰를 통해, AI에 익숙하지 않은 사람도 자신의 노하우를 정교한 프롬프트(스킬)로 만들고 공유·탐색할 수 있는 서비스.
- **Who it's for:** 누구나. 첫 접근은 여러 카테고리의 인플루언서 섭외.
- **Space/industry:** AI 프롬프트/스킬 SNS. 경쟁군은 ChatGPT/Claude 같은 범용 AI 챗봇 UI, prompt marketplace 류 서비스.
- **Project type:** 웹앱 (Next.js). 오늘 다룬 화면은 "스킬 크리에이터" 채팅형 인터뷰 플로우.

## Aesthetic Direction
- **Direction:** 단정하고 구조적인 그린 (Structured Green). 처음엔 코럴+세이지의 "따뜻하고 귀여운" 방향으로 시작했지만, 반복 피드백 끝에 더 각지고 신뢰감 있는 톤으로 정착.
- **Decoration level:** 절제됨 (intentional) — 타이포와 여백이 대부분의 일을 하고, 카드/버블에만 라운드를 준다.
- **Mood:** AI가 어렵지 않다는 인상을 주되, 장난감처럼 가볍지 않고 "잘 설계된 도구" 같은 신뢰감을 준다.
- **테마:** 라이트 모드만 지원 (다크모드는 이번 스코프에서 제외).

## Typography
Plex 패밀리로 통일 (Serif / Sans KR / Mono) — 세 서체가 한 가족이라 "설계된" 느낌이 강하다.

- **Display (Latin):** IBM Plex Serif, weight 500/600 — 브랜드 워드마크("skillsns")와 영문 포인트에만 절제해서 사용.
- **Body/UI (한글+라틴):** IBM Plex Sans KR, weight 400 — 채팅, 본문, 라벨 등 거의 모든 텍스트. 또박또박하고 각진 인상.
- **Mono (기술 라벨):** IBM Plex Mono, weight 400/500 — 파일명, 버전 태그, 스킬 패키지 메타데이터.
- **한글 폰트 주의:** 프리뷰 아티팩트에는 실제 사용된 글자만 골라 서브셋(fonttools)한 IBM Plex Sans KR(~33KB)을 임베드했다. 프로덕션에서는 앱 전체 문구를 커버하는 정적 서브셋 빌드 파이프라인을 구성하거나, 전체 variable font를 self-host할 것.
- **Scale:** hero 2.75rem(Serif) / h1 1.7rem(Serif) / kr-headline 2.15rem(Sans KR, weight 400 — Plex Sans KR엔 별도 bold 웨이트가 없어 크기로 위계를 준다) / body 1rem / small 0.82–0.9rem / caption(mono) 0.72rem.

## Color
- **Approach:** 단일 액센트 (restrained). 파랑·보라 일색인 AI 제품군에서 의도적으로 벗어났고, 그린 하나만 브랜드 컬러로 쓴다 — 초반에 세이지 그린을 세컨더리로 같이 뒀을 때 "처지는" 느낌이 있어 제거했다.
- **Primary:** `#56A67F` (그린) / hover `#4A9873` / on-primary 텍스트 `#FFFFFF`
  - 주의: 이 톤 위에 흰 텍스트를 올리면 대비율이 2.9:1로 WCAG AA(4.5:1) 미달이다. 프로덕트팀 판단으로 흰 텍스트를 유지하기로 했으나, 접근성 이슈가 제기되면 primary를 `#3F8865`~`#398058` 선으로 살짝 진하게 하는 것으로 대비를 4.5:1 이상으로 맞출 수 있다.
  - primary-tint (quiet 버튼/뱃지 배경): `#DCEAE1`
- **Background:** `#FAFAF7` / surface `#FFFFFF` / surface-2 `#F0F2EE` (뉴트럴 스톤 그레이 — 갈색 기 없음)
- **Text:** ink `#1E231F` / muted `#5C645D`
- **Border:** `#DDE3DD` (일반 카드) / outline-strong `#3A3A3A` (카테고리 선택 카드처럼 또렷한 대비가 필요한 요소 — 브랜드 컬러가 아닌 순수 진회색을 의도적으로 사용해, 아이콘이 카테고리를 구분해주고 테두리는 중립을 지킨다)
- **Semantic:** success `#2B8A7E`(청록 — primary 그린과 헷갈리지 않도록 의도적으로 다른 계열) / warning `#C98A2E` / error `#C65B45` / info `#4C7D94` (info-tint `#E1EAEE`)

## Spacing
- **Base unit:** 8px
- **Density:** comfortable — 채팅 인터페이스는 숨 쉴 공간이 필요하다.

## Layout
- **Approach:** 그리드 기반, 챗 중심. 모바일 앱으로 만들 예정이라 실제 타깃(좁은 뷰포트)에서는 엣지투엣지로 화면 전체를 채운다. 데스크톱 브라우저(Tailwind `sm:` 이상)에서만 폰 목업 프레임(최대 폭 390px — 실제 아이폰 CSS 폭 기준, 높이 720px 고정, 가운데 정렬, border/shadow/rounded-[20px])을 복원해서 개발·테스트 시 보기 편하게 한다 — 반응형 분기이지 프로덕션 모바일 뷰의 스타일은 아님. 목업 주변 배경은 색을 칠하지 않고 흰색(surface)으로 둔다.
- **Border radius (계층적):** input/field 8px · card 12–14px · 챗버블/모달 20px · 버튼/아바타 full(999px)

## Motion
- **Approach:** 절제된 인터랙션. 메시지는 slide-up+fade(0.35s ease)로 등장, 타이핑 인디케이터는 bounce(1.1s infinite), 버튼은 눌렀을 때 scale(0.97, 0.12s).
- prefers-reduced-motion 존중.

## Components (스킬 크리에이터 화면 기준)
- **카테고리 선택 카드:** 흰 배경 + 진회색(`#3A3A3A`) 테두리, hover 시 테두리/텍스트가 primary green으로. 파스텔 배경색을 쓰지 않고 이모지 아이콘으로만 카테고리를 구분한다.
- **챗 버블:** agent는 surface 배경 + border, user는 primary 배경 + on-primary 텍스트. 둘 다 20px 라운드, 말풍선 꼬리는 6px로 좁혀서 방향을 준다.
- **첨부 파일 칩:** info-tint 배경 (브랜드 컬러와 분리된 유틸리티 컬러).
- **패키징 카드:** surface 배경, 액션 버튼 3종(테스트/스킬 확인하기/패키징 완료).
- **스텝 프로그레스(도트 스테퍼):** 헤더 바로 아래 고정. 5단계(카테고리 → 주제/정의/타겟 → 대화 → 이름 → 패키징)를 번호 원으로 표시 — 완료는 primary 채움+체크마크 팝인, 진행중은 primary-tint 채움+링 펄스, 예정은 중립(surface-2/muted). 원 사이 연결선도 완료 구간만 primary로 채워짐.
- **단계별 확정 표시:** 카테고리/주제·정의·타겟/이름을 정하고 나면, 그 입력 UI(그리드·챗·폼) 대신 확정된 값을 보여주는 배지/카드가 그 자리에 남는다 (예: 카테고리 이모지+이름 배지, 주제/정의/타겟 요약 카드). 각 STEP 라벨은 계속 화면에 남아 어떤 단계에서 확정됐는지 보여준다.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-05 | 초기 제안: 코럴 프라이머리 + 세이지 세컨더리, Fraunces+Gowun Dodum, 파스텔 카테고리 카드 | AI-friendly, 귀엽고 단정한 톤을 목표로 함 |
| 2026-07-05 | Gowun Dodum → IBM Plex Sans KR, Fraunces → IBM Plex Serif | "더 딱딱한 느낌"을 원함. Plex 패밀리로 통일해 구조적 일관성 확보 |
| 2026-07-05 | 세이지 그린 제거, 그린을 단일 프라이머리로 | 코랄+세이지 병행 시 세이지가 "처지는" 느낌. 갈색 계열 뉴트럴도 스톤 그레이로 교체 |
| 2026-07-05 | 코럴+세이지 조합으로 재검토 후, 최종적으로 그린 단일 프라이머리로 재확정 | 여러 조합을 실제로 비교해본 뒤 그린 단일 액센트가 최종 방향으로 결정됨 |
| 2026-07-05 | 다크모드 제거, 라이트 모드만 지원 | 스코프 축소 — 다크모드는 추후 별도로 다룸 |
| 2026-07-05 | Primary를 기존 다크모드용 밝은 그린(#56A67F)으로 교체, on-primary는 흰색 유지 | 더 밝은 톤을 선호. 대비 이슈는 알고 있는 상태로 보류 |
| 2026-07-05 | 카테고리 카드 테두리를 뉴트럴 진회색(#3A3A3A)으로 확정 | 브랜드 컬러 대신 중립색을 써서 아이콘이 카테고리 구분을 전담하게 함 |
| 2026-07-06 | 폰 목업 프레임을 전면 폐기했다가, 데스크톱(`sm:`)에서만 복원하는 반응형으로 재조정 | 모바일 실기기에선 엣지투엣지가 맞지만, 데스크톱에서 전체 폭으로 늘어나면 챗 UI가 깨져 보여 개발/테스트 편의를 위해 데스크톱 전용으로 되살림 |
| 2026-07-06 | 스텝 프로그레스 "완료" 색을 코럴 → 연두 순으로 시도해봤다가, 결국 primary 그린 그대로 되돌림 | 색을 분리해보려 했으나 결국 원래 디자인 시스템의 단일 액센트 원칙을 그대로 따르기로 함 |
