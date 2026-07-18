import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// ── 프론트 ↔ 에이전트 연동 지점 ──────────────────────────────────────────
// 각 단계 = workflows/{step}.md 를 시스템 프롬프트로 Claude를 부르는 것.
// 백엔드가 나중에 자기 서버에 붙일 땐 이 라우트와 "같은 계약"만 지키면,
// 프론트는 NEXT_PUBLIC_AGENT_BASE_URL 만 바꿔서 갈아끼운다.
//   요청 POST /api/agent/{step}  body: { skillInfo, messages }
//   응답 { reply, skillInfo, done }
// ────────────────────────────────────────────────────────────────────────

const STEP_FILES: Record<string, string> = {
  "what-skill": "what-skill.md",
  "skill-content": "skill-content.md",
  "skill-name": "skill-name.md",
  "skill-test": "skill-test.md",
  "skill-improve": "skill-improve.md",
};

type Msg = { role: "user" | "agent"; content: string };

const CONTENT_PROPS = {
  procedure: { type: "string" as const },
  rules: { type: "string" as const },
  checklist: { type: "string" as const },
  cases: { type: "string" as const },
  knowhow: { type: "string" as const },
  safety: { type: "string" as const },
  tone: { type: "string" as const },
};

const SUBMIT_TURN_TOOL: Anthropic.Tool = {
  name: "submit_turn",
  description:
    "이번 대화 턴의 결과를 제출한다. 매 턴 반드시 이 도구로만 응답한다.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "사용자에게 보여줄 다음 메시지(말풍선). 지침의 말투와 시작 문구 규칙을 따른다.",
      },
      skill_info: {
        type: "object",
        description:
          "이번 대화까지로 확정된 필드만 채운다. 아직 안 정해진 필드는 넣지 않는다.",
        properties: {
          topic: { type: "string" },
          definition: { type: "string" },
          target: { type: "string" },
          name: { type: "string" },
          content: { type: "object", properties: CONTENT_PROPS },
        },
      },
      choices: {
        type: "array",
        items: { type: "string" },
        description:
          "사용자가 하나 고르도록 제시할 선택지(예: 스킬 후보들). 각 항목은 짧은 이름/제목 한 줄만 (예: '블로그 제목 짓기'). 순위 숫자('1위.')나 이유 설명은 넣지 마라 — 카드가 번호를 붙이고 길면 지저분해진다. 순서는 추천순. reply는 짧은 질문만.",
      },
      summary: {
        type: "boolean",
        description:
          "주제/정의/타겟을 다 정해 '이대로 진행할까요?' 확인받는 순간이면 true. 이때 skill_info에 topic/definition/target을 채우고 reply는 짧게.",
      },
      done: {
        type: "boolean",
        description: "이 단계의 목표가 끝났으면 true, 대화가 더 필요하면 false.",
      },
    },
    required: ["reply", "done"],
  },
};

function fillVars(md: string, info: Record<string, unknown>): string {
  return md
    .replaceAll("{카테고리}", String(info.category ?? ""))
    .replaceAll("{스킬 주제}", String(info.topic ?? ""))
    .replaceAll("{타겟}", String(info.target ?? ""));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step } = await params;
  const file = STEP_FILES[step];
  if (!file) {
    return NextResponse.json(
      { error: `알 수 없는 단계: ${step}` },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 .env.local에 없어요. 키를 넣고 dev 서버를 다시 켜주세요." },
      { status: 500 }
    );
  }

  let body: { skillInfo?: Record<string, unknown>; messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const skillInfo = body.skillInfo ?? {};
  const rawMessages = body.messages ?? [];

  const md = await readFile(
    path.join(process.cwd(), "workflows", file),
    "utf8"
  );

  const system = `${fillVars(md, skillInfo)}

---
[연동 지침 — 반드시 따른다]
너는 위 지침을 그대로 따르는 에이전트다. 사용자와의 대화가 이어진다.
- 매 턴 반드시 submit_turn 도구를 호출해 응답한다. 도구 밖 텍스트는 쓰지 않는다.
- reply: 위 지침의 말투/시작 문구/한 번에 하나만 묻기 규칙을 지킨 다음 메시지. **말은 짧고 간결하게** — 목록·요약은 아래 choices/summary로 넘기고 reply에 길게 늘어놓지 않는다.
- choices: 사용자가 하나 고를 후보를 제시할 땐 여기 배열로 넣는다(화면에 카드로 뜸). 각 항목은 **짧은 이름만**(예: "블로그 제목 짓기") — 순위 숫자·이유 문장 금지. reply는 "이 중에 뭘 만들어볼까요?" 같은 짧은 질문만.
- summary: 주제/정의/타겟을 다 정해 사용자에게 "이대로 진행할까요?"로 확인받는 순간이면 true로 하고 skill_info에 topic/definition/target을 채운다. reply는 짧게. 요약 카드와 진행/수정 버튼은 화면이 알아서 그린다.
- skill_info: 지금까지의 대화로 확정된 필드만 채운다. 아직이면 넣지 않는다.
- done: 사용자가 "이대로 진행"을 확인해 이 단계가 끝났으면 true.
현재까지 누적된 정보: ${JSON.stringify(skillInfo)}`;

  const messages: Anthropic.MessageParam[] = rawMessages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));
  // Claude는 첫 메시지가 user여야 한다. 에이전트가 먼저 말하는 단계면 킥오프를 넣는다.
  if (messages.length === 0 || messages[0].role === "assistant") {
    messages.unshift({ role: "user", content: "(대화를 시작해주세요.)" });
  }

  const anthropic = new Anthropic();

  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 1024,
      system,
      messages,
      tools: [SUBMIT_TURN_TOOL],
      tool_choice: { type: "tool", name: "submit_turn" },
    });

    const toolUse = res.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json(
        { error: "에이전트가 응답 형식을 지키지 않았어요." },
        { status: 502 }
      );
    }

    const out = toolUse.input as {
      reply: string;
      skill_info?: Record<string, unknown>;
      choices?: string[];
      summary?: boolean;
      done: boolean;
    };

    return NextResponse.json({
      reply: out.reply,
      skillInfo: out.skill_info ?? {},
      choices: out.choices ?? null,
      summary: Boolean(out.summary),
      done: Boolean(out.done),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `Claude 호출 실패: ${message}` },
      { status: 500 }
    );
  }
}
