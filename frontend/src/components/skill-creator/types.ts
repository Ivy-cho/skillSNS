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

export type SkillContent = {
  procedure: string;
  rules: string;
  checklist: string;
  cases: string;
  knowhow: string;
  safety: string;
  tone: string;
};

// 단계를 지나며 누적되는 하나의 객체. 프론트는 이 객체 하나를 state로 들고 있고,
// 각 단계는 백엔드(skill-service) 응답의 skill_info를 이 객체에 merge해 자기 필드만 patch한다.
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
