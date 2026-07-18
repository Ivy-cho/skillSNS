# skillsns

대화형 "질문 Agent"와의 심층 인터뷰를 통해, AI에 익숙하지 않은 사람도 자신의 노하우를 정교한 프롬프트(스킬)로 만들고 공유·탐색할 수 있는 서비스입니다.

## 시작하기

```bash
npm install
npm run dev
```

기본은 [http://localhost:3000](http://localhost:3000)이지만, 3000번 포트가 이미 사용 중이면 Next.js가 자동으로 다음 포트(3001 등)를 잡아줍니다 — 터미널에 출력되는 실제 URL을 확인하세요.

- `/` — 스킬 크리에이터 (카테고리 선택 → 대화 → 이름짓기 → 패키징)
- `/skill/[slug]` — 패키징된 스킬을 사용해보는 챗 화면

## 기술 스택

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4

## 디자인 시스템

UI/색상/타이포/spacing 등 모든 시각적 결정의 기준은 [`design.md`](./design.md)입니다. 화면 작업 전에 먼저 확인하세요 (`CLAUDE.md`에도 명시되어 있습니다).

## 프로젝트 구조

```
src/
  app/                      라우트 (page.tsx, skill/[slug])
  components/
    skill-creator/          스킬 만들기 플로우 컴포넌트
    skill-usage/            스킬 사용 챗 컴포넌트
```

## 백엔드 연동

지금은 대화 응답, 이름 제안, 패키징 등이 전부 프론트엔드 목업(mock)입니다. 실제 연동 시 어떤 부분이 가짜인지는 [`BACKEND_HANDOFF.md`](./BACKEND_HANDOFF.md)를 참고하세요.

## 배포

`main` 브랜치에 push하면 Vercel에 자동 배포됩니다 → https://skillsns.vercel.app
