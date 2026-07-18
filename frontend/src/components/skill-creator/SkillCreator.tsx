"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryGrid } from "./CategoryGrid";
import { ChatBubble } from "./ChatBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChatInputBar } from "./ChatInputBar";
import { PackagedResult } from "./PackagedResult";
import { AttachModal } from "./AttachModal";
import { NamingStep } from "./NamingStep";
import { CandidatePicker } from "./CandidatePicker";
import { StepProgress } from "./StepProgress";
import { SkillPreview } from "./SkillPreview";
import { TestReport as TestReportView } from "./TestReport";
import { ImproveStep } from "./ImproveStep";
import {
  type Category,
  type ChatMessage,
  type Phase,
  type SkillContent,
  type SkillInfo,
  EMPTY_SKILL_INFO,
  mockTestReport,
  slugify,
} from "./types";

const TYPING_DELAY_MS = 900;

// skill-content 심층 인터뷰 — 한 번에 한 항목씩 물어 content를 채운다.
const CONTENT_INTERVIEW: { key: keyof SkillContent; question: string }[] = [
  {
    key: "procedure",
    question: "이 스킬을 쓸 때, 처음부터 끝까지 어떤 순서로 하나요?",
  },
  {
    key: "rules",
    question:
      "상황이 갈릴 때는 무엇을 기준으로 정해요? '이건 무조건 피해라' 하는 것도 있으면 알려주세요.",
  },
  {
    key: "checklist",
    question: "이것만은 꼭 확인한다 하는 게 있어요?",
  },
  {
    key: "cases",
    question: "실제로 겪은 성공이나 실패 경험이 있다면 하나 들려주세요.",
  },
  {
    key: "knowhow",
    question: "남들은 잘 모르는, 나만의 요령이나 팁이 있어요?",
  },
  {
    key: "safety",
    question:
      "이 스킬이 잘 모르는 걸 물어봤을 때 어떻게 답하면 좋을까요? (예: 확실치 않으면 '직접 확인해보세요'라고 안내하기)",
  },
  {
    key: "tone",
    question:
      "마지막으로 말투나 성격도 정해볼까요? 원하는 스타일을 말해주거나, 필요 없으면 '괜찮아요'라고 해주세요.",
  },
];

const STEP_BY_PHASE: Record<Phase, number> = {
  category: 1,
  topicChat: 2,
  interviewing: 3,
  naming: 4,
  reviewing: 5,
  testing: 5,
  improving: 6,
  published: 7,
};

export function SkillCreator() {
  const [phase, setPhase] = useState<Phase>("category");
  // 렌더용: 이모지/id가 필요해 Category 객체로 따로 들고 있다 (contract용 라벨은 skillInfo.category).
  const [category, setCategory] = useState<Category | null>(null);
  // ⬇︎ workflows/skill_info.json 스키마 그대로. 모든 단계 데이터가 여기 누적된다.
  const [skillInfo, setSkillInfo] = useState<SkillInfo>(EMPTY_SKILL_INFO);
  // UI 전용 state (대화 렌더, 진행 위치 등 — 백엔드 contract와 무관)
  const [briefMessages, setBriefMessages] = useState<ChatMessage[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contentStep, setContentStep] = useState(0);
  const [pending, setPending] = useState<{
    choices?: string[] | null;
    summary?: boolean;
  }>({});
  const [didImprove, setDidImprove] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [briefMessages, messages, isTyping, phase, skillInfo]);

  function patchInfo(patch: Partial<SkillInfo>) {
    setSkillInfo((prev) => ({ ...prev, ...patch }));
  }

  function patchContent(key: keyof SkillContent, value: string) {
    setSkillInfo((prev) => ({
      ...prev,
      content: { ...prev.content, [key]: value },
    }));
  }

  function nextId() {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  }

  function pushMessage(
    role: ChatMessage["role"],
    content: string,
    kind: ChatMessage["kind"] = "text"
  ) {
    setMessages((prev) => [...prev, { id: nextId(), role, kind, content }]);
  }

  function pushBriefMessage(role: ChatMessage["role"], content: string) {
    setBriefMessages((prev) => [
      ...prev,
      { id: nextId(), role, kind: "text", content },
    ]);
  }

  // ── AGENT SEAM ──────────────────────────────────────────────────────────
  // 지금은 에이전트 응답이 전부 고정 문구(mock)다. agentReply가 "말풍선을 띄우는"
  // 렌더 지점이고, 무엇을 말할지·어떤 skillInfo 필드를 채울지는 아래 각 phase 분기가
  // 정한다. 백엔드 연동 시: 각 phase 분기를 POST /api/agent/{step} 호출로 바꿔
  //   요청 { skillInfo, messages, userMessage }
  //   응답 { reply, skillInfo(patch), done }
  // 를 받아 patchInfo(응답.skillInfo) + agentReply(응답.reply) + (done이면) 다음 phase
  // 로 넘기면 된다. 화면/흐름은 그대로 두고 이 분기 속만 교체하면 됨.
  function agentReply(
    content: string,
    after?: () => void,
    target: "brief" | "conversation" = "conversation"
  ) {
    setIsTyping(true);
    window.setTimeout(() => {
      setIsTyping(false);
      if (target === "brief") {
        pushBriefMessage("agent", content);
      } else {
        pushMessage("agent", content);
      }
      after?.();
    }, TYPING_DELAY_MS);
  }

  // ── 실제 에이전트 호출 (Claude) ──
  // /api/agent/{step} → { reply, skillInfo(patch), done }. 백엔드로 옮길 땐
  // NEXT_PUBLIC_AGENT_BASE_URL 값만 바꾸면 프론트는 그대로.
  async function callAgent(
    step: string,
    info: SkillInfo,
    convo: { role: "user" | "agent"; content: string }[]
  ): Promise<{
    reply?: string;
    skillInfo?: Partial<SkillInfo>;
    choices?: string[] | null;
    summary?: boolean;
    done?: boolean;
    error?: string;
  }> {
    setIsTyping(true);
    try {
      const base = process.env.NEXT_PUBLIC_AGENT_BASE_URL ?? "";
      const res = await fetch(`${base}/api/agent/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillInfo: info, messages: convo }),
      });
      return await res.json();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "네트워크 오류" };
    } finally {
      setIsTyping(false);
    }
  }

  function briefConvo(): { role: "user" | "agent"; content: string }[] {
    return briefMessages.map((m) => ({ role: m.role, content: m.content }));
  }

  async function handleSelectCategory(selected: Category) {
    setCategory(selected);
    const info = { ...EMPTY_SKILL_INFO, category: selected.label };
    patchInfo({ category: selected.label });
    setPhase("topicChat");
    const data = await callAgent("what-skill", info, []);
    if (data.error) {
      pushBriefMessage("agent", `⚠️ ${data.error}`);
      return;
    }
    if (data.skillInfo) patchInfo(data.skillInfo);
    if (data.reply) pushBriefMessage("agent", data.reply);
    setPending({ choices: data.choices, summary: data.summary });
  }

  async function handleSend(text: string) {
    if (phase === "topicChat") {
      setPending({});
      pushBriefMessage("user", text);
      const convo = [...briefConvo(), { role: "user" as const, content: text }];
      const data = await callAgent("what-skill", skillInfo, convo);
      if (data.error) {
        pushBriefMessage("agent", `⚠️ ${data.error}`);
        return;
      }
      if (data.skillInfo) patchInfo(data.skillInfo);
      if (data.reply) pushBriefMessage("agent", data.reply);
      setPending({ choices: data.choices, summary: data.summary });
      if (data.done) {
        const topicNow = data.skillInfo?.topic ?? skillInfo.topic;
        setPhase("interviewing");
        setContentStep(0);
        agentReply(
          `좋아요! 이제 '${topicNow}'가 실제로 어떻게 도와줄지, 알맹이를 하나씩 채워볼게요. ${CONTENT_INTERVIEW[0].question}`
        );
      }
      return;
    }

    if (phase === "interviewing") {
      pushMessage("user", text);
      const key = CONTENT_INTERVIEW[contentStep].key;
      const value =
        key === "tone" && /괜찮|없어|없다|넘어|필요\s*없/.test(text)
          ? ""
          : text;
      patchContent(key, value);

      const next = contentStep + 1;
      if (next < CONTENT_INTERVIEW.length) {
        setContentStep(next);
        agentReply(CONTENT_INTERVIEW[next].question);
      } else {
        agentReply(
          "좋아요! 말씀해주신 내용을 바탕으로 스킬을 정리해봤어요. 이제 이름을 정해볼까요?",
          () => setPhase("naming")
        );
      }
      return;
    }
  }

  function handleAttach(fileName: string) {
    pushMessage("user", fileName, "attachment");
    if (phase === "interviewing") {
      agentReply(
        "좋은 자료네요, 참고해서 반영할게요. 이어서 편하게 말씀해주셔도 좋아요."
      );
    }
  }

  function handleConfirmName(name: string) {
    patchInfo({ name, testReport: mockTestReport(name) });
    pushMessage(
      "agent",
      `"${name}"(으)로 정했어요! 완성된 스킬을 아래에서 확인해보세요.`
    );
    setPhase("reviewing");
  }

  const { topic, definition, target, name: skillName, testReport } = skillInfo;

  const version = category ? `skill_${slugify(category.label)}_v1.0` : "";

  const slug = skillName
    ? `${slugify(category?.label ?? "")}-${briefMessages.length + messages.length}`
    : "";

  const briefDone = Boolean(topic && definition && target);

  const markdown = `# ${skillName}

- 카테고리: ${category?.label ?? ""}
- 버전: ${version}
- 상세 주제: ${topic}
- 한 줄 정의: ${definition}
- 타겟: ${target}

## 대화 기록

${[...briefMessages, ...messages]
  .filter((m) => m.kind === "text")
  .map((m) => `**${m.role === "user" ? "작성자" : "질문 Agent"}:** ${m.content}`)
  .join("\n\n")}
`;

  const inputDisabled =
    phase === "category" ||
    phase === "naming" ||
    phase === "reviewing" ||
    phase === "testing" ||
    phase === "improving" ||
    phase === "published" ||
    isTyping;

  const isBriefTyping = isTyping && phase === "topicChat";

  const isConversationTyping = isTyping && phase === "interviewing";

  const currentStep = STEP_BY_PHASE[phase];

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="border-b border-border">
        <div className="flex items-center gap-2.5 px-5 pt-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">
            🤖
          </div>
          <div className="text-[0.95rem] font-bold">스킬 크리에이터</div>
        </div>
        <StepProgress currentStep={currentStep} />
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-bg p-5"
      >
        <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
          STEP 1 · 카테고리 선택
        </p>
        {category ? (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-outline-strong bg-surface px-3.5 py-1.5 text-[0.82rem] text-ink">
              <span className="text-base">{category.emoji}</span>
              {category.label}
            </div>
          </div>
        ) : (
          <CategoryGrid onSelect={handleSelectCategory} />
        )}

        {category && (
          <>
            <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              STEP 2 · 상세 주제 / 한 줄 정의 / 타겟 정하기
            </p>

            {briefMessages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isBriefTyping && <TypingIndicator />}

            {phase === "topicChat" &&
              !isTyping &&
              pending.choices &&
              pending.choices.length > 0 && (
                <CandidatePicker
                  candidates={pending.choices.map((c) =>
                    c
                      .split("\n")[0]
                      .replace(/^\s*\d+위[.\s]*/, "")
                      .trim()
                  )}
                  onPick={handleSend}
                />
              )}

            {briefDone && (
              <div className="rounded-2xl border border-border bg-surface p-4 text-[0.85rem] text-ink">
                <div>
                  <span className="font-semibold">상세 주제</span> · {topic}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">한 줄 정의</span> ·{" "}
                  {definition}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">타겟</span> · {target}
                </div>

                {phase === "topicChat" && pending.summary && !isTyping && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => handleSend("네, 이걸로 진행할게요!")}
                      className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.98]"
                    >
                      이걸로 진행하기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSend("조금 더 다듬고 싶어요.")}
                      className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.98]"
                    >
                      더 다듬을래요
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {briefDone && (
          <>
            <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              STEP 3 · 스킬 내용 채우기
            </p>

            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isConversationTyping && <TypingIndicator />}
          </>
        )}

        {briefDone && category && currentStep >= 4 && (
          <>
            <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              STEP 4 · 이름 정하기
            </p>
            {skillName ? (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-outline-strong bg-surface px-3.5 py-1.5 text-[0.82rem] text-ink">
                  {skillName}
                </div>
              </div>
            ) : (
              <NamingStep topic={topic} onConfirm={handleConfirmName} />
            )}
          </>
        )}

        {skillName &&
          (phase === "reviewing" ||
            phase === "testing" ||
            phase === "improving" ||
            phase === "published") && (
            <>
              <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
                STEP 5 · 테스트
              </p>

              {phase === "reviewing" && (
                <div className="rounded-xl bg-success/10 px-4 py-3 text-[0.85rem] leading-relaxed text-success">
                  🎉 스킬이 완성됐어요! 아래 skill.md를 확인하고, 준비되면
                  테스트해보세요.
                </div>
              )}

              <SkillPreview info={skillInfo} />

              {phase === "reviewing" && testReport && (
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <h3 className="text-[0.9rem] font-bold">테스트해볼까요?</h3>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">
                    이런 질문들을 스킬에게 던져서 잘 답하는지 확인해볼게요.
                  </p>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {testReport.sampleQuestions.slice(0, 4).map((q) => (
                      <li
                        key={q.question}
                        className="text-[0.82rem] leading-relaxed text-ink"
                      >
                        · {q.question}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setPhase("testing")}
                    className="mt-4 w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
                  >
                    테스트 시작하기
                  </button>
                </div>
              )}

              {phase !== "reviewing" && testReport && (
                <TestReportView report={testReport} />
              )}

              {phase === "testing" && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase("improving")}
                    className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
                  >
                    스킬 개선하기
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase("published")}
                    className="w-full rounded-full border border-border px-3.5 py-2.5 text-[0.85rem] font-semibold text-ink transition active:scale-[0.99]"
                  >
                    개선 없이 바로 게시하기
                  </button>
                </div>
              )}
            </>
          )}

        {testReport &&
          (phase === "improving" || (phase === "published" && didImprove)) && (
            <>
              <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
                STEP 6 · 스킬 개선
              </p>
              {phase === "improving" ? (
                <ImproveStep
                  report={testReport}
                  onFinish={() => {
                    setDidImprove(true);
                    setPhase("published");
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-border bg-surface p-4 text-[0.85rem] text-ink">
                  ✓ 보완이 필요한 항목을 반영해 스킬을 다듬었어요.
                </div>
              )}
            </>
          )}

        {phase === "published" && skillName && (
          <>
            <p className="text-center font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              스킬 게시
            </p>
            <PackagedResult
              skillName={skillName}
              version={version}
              category={category?.label ?? ""}
              categoryEmoji={category?.emoji ?? "🤖"}
              markdown={markdown}
              slug={slug}
            />
          </>
        )}
      </div>

      <ChatInputBar
        disabled={inputDisabled}
        onSend={handleSend}
        onAttach={() => setAttachOpen(true)}
        showAttach={phase === "interviewing"}
      />

      <AttachModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onAttach={handleAttach}
      />
    </div>
  );
}
