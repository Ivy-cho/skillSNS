export type Category = {
  id: string;
  label: string;
  emoji: string;
};

export const CATEGORIES: Category[] = [
  { id: "writing", label: "글쓰기", emoji: "✍️" },
  { id: "interior", label: "인테리어", emoji: "🛋️" },
  { id: "career", label: "커리어", emoji: "💼" },
  { id: "finance", label: "재테크", emoji: "💰" },
  { id: "vibe", label: "바이브 코딩", emoji: "🧑‍💻" },
  { id: "custom", label: "기타", emoji: "✏️" },
];

export type ChatMessage = {
  id: string;
  role: "agent" | "user";
  kind: "text" | "attachment";
  content: string;
};

export type Phase =
  | "category"
  | "topicChat"
  | "interviewing"
  | "naming"
  | "reviewing"
  | "testing"
  | "improving"
  | "published";

// skill_info.json의 content 객체 (workflows/skill_info.json)
export type SkillContent = {
  procedure: string;
  rules: string;
  checklist: string;
  cases: string;
  knowhow: string;
  safety: string;
  tone: string;
};

// content는 이제 STEP 3 심층 인터뷰(SkillCreator의 CONTENT_INTERVIEW)에서
// 사용자 답변으로 실제로 채워진다. (백엔드 skill-content 에이전트가 붙기 전까지의 mock 대화)

// workflows/skill_info.json — 단계를 지나며 누적되는 하나의 객체.
// 프론트는 이 객체 하나를 state로 들고 있고, 각 단계는 자기 필드만 patch한다.
// 백엔드 연동 시: 에이전트 응답이 내려주는 필드를 이 객체에 merge하면 화면이 그려진다.
export type SkillInfo = {
  category: string;
  topic: string;
  definition: string;
  target: string;
  content: SkillContent;
  name: string;
  testReport: TestReport | null;
};

// skillInfo → 사람이 읽는 skill.md 파일 문자열. (미리보기/다운로드 공통)
export function skillMarkdown(info: SkillInfo): string {
  const sections: [string, string][] = [
    ["절차", info.content.procedure],
    ["규칙", info.content.rules],
    ["체크리스트", info.content.checklist],
    ["사례", info.content.cases],
    ["노하우", info.content.knowhow],
    ["안전장치", info.content.safety],
    ["말투", info.content.tone],
  ];
  const body = sections
    .filter(([, v]) => v.trim())
    .map(([label, v]) => `## ${label}\n${v}`)
    .join("\n\n");
  return `# ${info.name}

- 카테고리: ${info.category}
- 주제: ${info.topic}
- 한 줄 정의: ${info.definition}
- 타겟: ${info.target}

${body}
`;
}

export const EMPTY_SKILL_INFO: SkillInfo = {
  category: "",
  topic: "",
  definition: "",
  target: "",
  content: {
    procedure: "",
    rules: "",
    checklist: "",
    cases: "",
    knowhow: "",
    safety: "",
    tone: "",
  },
  name: "",
  testReport: null,
};

// test_report.json 스키마를 그대로 따르는 타입 (workflows/test_report.json)
export type Grade = 1 | 2 | 3 | 4 | 5;

export type DiagnosisArea = {
  area: string;
  grade: Grade;
  gradeLabel: "매우 좋음" | "좋음" | "보통" | "보완 필요" | "없음";
  now: string;
  suggestion: string;
};

export type TestReport = {
  sampleQuestions: { question: string; source: "auto" | "user" }[];
  diagnosis: DiagnosisArea[];
  benchmark: {
    passRate: { withSkill: number; withoutSkill: number; help: string };
    time: { seconds: number; help: string };
    aiCost: { level: "적음" | "보통" | "많음"; help: string };
  };
  analystNotes: string[];
};

// 백엔드(skill-test 에이전트) 연동 전까지 쓰는 가짜 진단 보고서.
// 실제로는 완성된 스킬을 돌려 나온 결과가 이 자리에 들어온다.
export function mockTestReport(skillName: string): TestReport {
  return {
    sampleQuestions: [
      { question: "첫 문장이 안 써질 때 어떻게 시작하면 좋아요?", source: "auto" },
      { question: "지루한 도입부를 어떻게 바꿔요?", source: "auto" },
      { question: "독자가 끝까지 읽게 하려면요?", source: "auto" },
      { question: "제목이랑 첫 문장이 따로 노는 것 같아요.", source: "auto" },
      { question: "예시가 없을 때도 첫 문장 잡는 법이 있어요?", source: "auto" },
      { question: "블로그 말고 이메일에도 써먹을 수 있어요?", source: "user" },
    ],
    diagnosis: [
      {
        area: "절차",
        grade: 4,
        gradeLabel: "좋음",
        now: "첫 문장을 잡는 순서가 단계별로 잘 정리돼 있어요.",
        suggestion: "",
      },
      {
        area: "규칙",
        grade: 3,
        gradeLabel: "보통",
        now: "상황별 판단 기준이 조금 부족해요.",
        suggestion: "'이럴 땐 이렇게'처럼 갈림길 규칙을 두어 개 더 넣으면 좋아요.",
      },
      {
        area: "체크리스트",
        grade: 2,
        gradeLabel: "보완 필요",
        now: "글 올리기 전에 확인할 항목이 거의 없어요.",
        suggestion: "발행 전 꼭 점검할 항목 3가지를 정해보세요.",
      },
      {
        area: "사례",
        grade: 4,
        gradeLabel: "좋음",
        now: "실제 성공·실패 예시가 풍부해요.",
        suggestion: "",
      },
      {
        area: "노하우",
        grade: 5,
        gradeLabel: "매우 좋음",
        now: "남다른 팁이 확실히 드러나요.",
        suggestion: "",
      },
      {
        area: "안전장치",
        grade: 1,
        gradeLabel: "없음",
        now: "모르는 걸 어떻게 답할지 정해두지 않았어요.",
        suggestion:
          "확실치 않은 정보는 단정하지 말고 '직접 확인해보세요'로 안내하는 규칙을 꼭 넣어주세요.",
      },
      {
        area: "커버리지",
        grade: 3,
        gradeLabel: "보통",
        now: "대부분 질문엔 답했지만 이메일 관련 질문엔 약했어요.",
        suggestion: "블로그 외 상황(이메일 등) 예시를 조금 더 넣어보세요.",
      },
      {
        area: "말투",
        grade: 4,
        gradeLabel: "좋음",
        now: "친근한 존댓말 톤이 잘 유지돼요.",
        suggestion: "",
      },
    ],
    benchmark: {
      passRate: {
        withSkill: 83,
        withoutSkill: 33,
        help: `"${skillName}"을(를) 켜니 6문제 중 5개를 제대로 답했어요. 껐을 땐 2개였어요.`,
      },
      time: { seconds: 11, help: "한 번 답하는 데 평균 11초 걸렸어요." },
      aiCost: {
        level: "보통",
        help: "AI가 한 번 답하는 데 든 생각 비용이에요. 낮을수록 저렴해요.",
      },
    },
    analystNotes: [
      "안전장치가 없어서, 잘 모르는 걸 물었을 때 지어내듯 답하는 경우가 있었어요.",
      "이메일에 써먹을 수 있냐는 질문에선 답이 흔들렸어요 — 예시가 블로그에 치우쳐 있어요.",
      "노하우와 사례가 탄탄해서, 아는 주제에선 스킬을 껐을 때보다 훨씬 나았어요.",
    ],
  };
}

export function slugify(label: string) {
  const map: Record<string, string> = {
    글쓰기: "writing",
    인테리어: "interior",
    커리어: "career",
    재테크: "finance",
    "바이브 코딩": "vibe",
  };
  return map[label] ?? "skill";
}

// workflows/skill-name.md — 서로 다른 3각도(명확형/호기심형/구체·혜택형)로 제안.
// 지금은 주제를 템플릿에 끼워넣는 mock. 백엔드 skill-name 에이전트가 붙으면
// 스킬 알맹이에서 "가장 매력적인 한 조각"을 골라 이름을 짓는 방식으로 바뀐다.
export type NameSuggestion = { name: string; angle: string; desc: string };

export function nameSuggestions(topic: string, batch: number): NameSuggestion[] {
  const t = topic.trim() || "이 스킬";
  const batches: NameSuggestion[][] = [
    [
      { name: `${t} 가이드`, angle: "명확형", desc: "뭘 알려주는지 한눈에 보여요." },
      {
        name: `${t}, 이렇게 하면 달라져요`,
        angle: "호기심형",
        desc: "'어떻게?' 하고 눌러보고 싶어져요.",
      },
      {
        name: `${t} 실전 3단계`,
        angle: "구체·혜택형",
        desc: "몇 단계로 뭘 얻는지 딱 떨어져요.",
      },
    ],
    [
      {
        name: `한눈에 끝내는 ${t}`,
        angle: "명확형",
        desc: "핵심만 빠르게 훑는 느낌이에요.",
      },
      {
        name: `${t}, 나만 알던 팁`,
        angle: "호기심형",
        desc: "나만의 노하우라는 인상을 줘요.",
      },
      {
        name: `초보도 되는 ${t} 5원칙`,
        angle: "구체·혜택형",
        desc: "누구나 따라 할 수 있다는 신뢰를 줘요.",
      },
    ],
  ];
  return batches[batch] ?? [];
}
