"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryGrid } from "./CategoryGrid";
import { ChatBubble } from "./ChatBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChatInputBar } from "./ChatInputBar";
import { PackagedResult } from "./PackagedResult";
import { AttachModal } from "./AttachModal";
import { CandidatePicker } from "./CandidatePicker";
import { StepProgress } from "./StepProgress";
import { SkillPreview } from "./SkillPreview";
import { TestReport as TestReportView } from "./TestReport";
import {
  type Category,
  type ChatMessage,
  type Phase,
  type SkillContent,
  type SkillInfo,
  EMPTY_SKILL_INFO,
} from "./types";
import {
  confirmDraft,
  continueDraft,
  improveDraft,
  startDraft,
  type PublishedSkill,
} from "@/lib/backendClient";

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

const STEP_LABEL: Record<Phase, string> = {
  category: "카테고리 선택",
  topicChat: "상세 주제 정하기",
  interviewing: "스킬 내용 채우기",
  naming: "이름 정하기",
  reviewing: "테스트 준비",
  testing: "테스트 결과",
  improving: "스킬 개선",
  published: "게시",
};

// skill-service의 stage 문자열 -> 화면 phase. skill_test는 testReport가 아직 없으면
// "테스트 준비"(reviewing), 있으면 "테스트 결과"(testing) 화면으로 나뉜다.
function phaseForStage(stage: string, info: SkillInfo): Phase {
  switch (stage) {
    case "what_skill":
      return "topicChat";
    case "skill_content":
      return "interviewing";
    case "skill_name":
      return "naming";
    case "skill_test":
      return info.testReport ? "testing" : "reviewing";
    case "skill_improve":
      return "improving";
    default:
      return "topicChat";
  }
}

function mergeSkillInfo(prev: SkillInfo, patch: Record<string, unknown>): SkillInfo {
  const content =
    patch.content && typeof patch.content === "object"
      ? { ...prev.content, ...(patch.content as Partial<SkillContent>) }
      : prev.content;
  return { ...prev, ...patch, content } as SkillInfo;
}

// 이름 후보 카드 아래에 붙는 "직접 입력" — 채팅창에 그냥 타이핑해도 되지만(자유 텍스트로
// 처리됨), 그 사실이 눈에 안 띄어서 옛 NamingStep처럼 명시적인 입력창을 따로 둔다.
// 제출하면 onSend(=handleSend)로 넘어가 일반 채팅 메시지와 똑같이 처리된다.
function CustomNameInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <label className="text-[0.78rem] text-muted">또는 직접 이름을 지어주세요</label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="예: 임팩트 있는 첫 문장 쓰기"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = value.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
            setValue("");
          }}
          disabled={!value.trim()}
          className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary disabled:opacity-40"
        >
          이 이름으로
        </button>
      </div>
    </div>
  );
}

// 완료되면 사용자 입력 없이 곧장 다음 단계 시작 문구까지 이어 받아오는 stage들.
// (skill_test/skill_improve 진입은 "테스트 시작하기"/"개선하기" 버튼이 명시적으로 트리거하므로
// 여기 포함하지 않는다 — 그건 사용자가 실제로 결정하는 지점이라 자동으로 넘기면 안 된다.)
const AUTO_CONTINUE_STAGES = new Set(["skill_content", "skill_name"]);

export function SkillCreator() {
  const [phase, setPhase] = useState<Phase>("category");
  // 렌더용: 이모지/id가 필요해 Category 객체로 따로 들고 있다 (backend엔 label만 보낸다).
  const [category, setCategory] = useState<Category | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [skillInfo, setSkillInfo] = useState<SkillInfo>(EMPTY_SKILL_INFO);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<{ choices?: string[] | null; summary?: boolean }>({});
  const [isTyping, setIsTyping] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [publishedSkill, setPublishedSkill] = useState<PublishedSkill | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // applyResponse가 재귀적으로 스스로를 이어 부를 수 있어서, React state(비동기 반영)가 아니라
  // ref(동기 반영)로 "지금까지 반영된 최신값"을 들고 있어야 직전 호출 결과를 바로 이어 읽을 수 있다.
  const skillInfoRef = useRef<SkillInfo>(EMPTY_SKILL_INFO);
  const stageRef = useRef<string>("");
  const draftIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, phase, pending]);

  function nextId() {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  }

  function pushMessage(role: ChatMessage["role"], content: string, kind: ChatMessage["kind"] = "text") {
    if (!content) return;
    setMessages((prev) => [...prev, { id: nextId(), role, kind, content }]);
  }

  // backend 응답 하나를 화면 상태에 반영하는 공용 지점 — 어떤 액션(카테고리 선택/메시지
  // 전송/첨부/개선 시작)이 불렀든 이 함수 하나만 거치면 skill_info/messages/phase가
  // 전부 갱신된다.
  //
  // 서버는 호출 하나당 단계 하나만 처리한다(원자성 유지, 자동 체이닝 없음). 대신 "방금 막
  // 다음 단계로 넘어갔고, 그 단계가 사용자 결정 없이 바로 시작해도 되는 단계"라면, 여기서
  // 화면엔 안 보이는 후속 호출을 곧장 이어 보내 그 단계의 시작 문구까지 받아온다 — 사용자는
  // 마치 한 번에 이어진 것처럼 보고, 서버 쪽은 여전히 호출 하나 = 단계 하나로 남는다.
  async function applyResponse(res: {
    stage: string;
    messages: string[];
    skill_info: Record<string, unknown>;
    choices?: string[] | null;
    summary?: boolean;
  }) {
    const merged = mergeSkillInfo(skillInfoRef.current, res.skill_info);
    skillInfoRef.current = merged;
    setSkillInfo(merged);
    for (const m of res.messages) pushMessage("agent", m);
    setPending({ choices: res.choices, summary: res.summary });

    const enteringAutoStage = stageRef.current !== res.stage && AUTO_CONTINUE_STAGES.has(res.stage);
    stageRef.current = res.stage;
    setPhase(phaseForStage(res.stage, merged));

    const id = draftIdRef.current;
    if (enteringAutoStage && id) {
      const kickoff = await continueDraft(id, "(진행)");
      await applyResponse(kickoff);
    }
  }

  async function handleSelectCategory(selected: Category) {
    setCategory(selected);
    setError(null);
    setIsTyping(true);
    try {
      const res = await startDraft(selected.label);
      draftIdRef.current = res.draft_id;
      setDraftId(res.draft_id);
      await applyResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "카테고리 선택 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSend(text: string) {
    if (!draftId) return;
    pushMessage("user", text);
    setPending({});
    setError(null);
    setIsTyping(true);
    try {
      const res = await continueDraft(draftId, text);
      await applyResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지 전송 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  async function handleAttach(file: File) {
    if (!draftId) return;
    pushMessage("user", file.name, "attachment");
    setAttachments((prev) => [...prev, file]);
    setPending({});
    setError(null);
    setIsTyping(true);
    try {
      const res = await continueDraft(draftId, "", [file]);
      await applyResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 첨부 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  async function handleImprove() {
    if (!draftId) return;
    setError(null);
    setIsTyping(true);
    try {
      const res = await improveDraft(draftId);
      await applyResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "개선 시작 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  async function handlePublish() {
    if (!draftId) return;
    setError(null);
    setIsTyping(true);
    try {
      const skill = await confirmDraft(draftId);
      setPublishedSkill(skill);
      setPhase("published");
    } catch (e) {
      setError(e instanceof Error ? e.message : "게시 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  const { topic, definition, target, name: skillName, testReport } = skillInfo;

  const version = category ? `skill_${category.id}_v1.0` : "";
  const slug = publishedSkill?.id ?? "";

  const inputDisabled =
    phase === "category" || phase === "reviewing" || phase === "testing" || phase === "published" || isTyping;

  const currentStep = STEP_BY_PHASE[phase];

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="border-b border-border">
        <div className="flex items-center gap-2.5 px-5 pt-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">🤖</div>
          <div className="text-[0.95rem] font-bold">스킬 크리에이터</div>
        </div>
        <StepProgress currentStep={currentStep} />
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-bg p-5">
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
              STEP {currentStep} · {STEP_LABEL[phase]}
            </p>

            {(topic || definition || target || skillName) && (
              <div className="rounded-2xl border border-border bg-surface p-4 text-[0.85rem] text-ink">
                {topic && (
                  <div>
                    <span className="font-semibold">상세 주제</span> · {topic}
                  </div>
                )}
                {definition && (
                  <div className="mt-1">
                    <span className="font-semibold">한 줄 정의</span> · {definition}
                  </div>
                )}
                {target && (
                  <div className="mt-1">
                    <span className="font-semibold">타겟</span> · {target}
                  </div>
                )}
                {skillName && (
                  <div className="mt-1">
                    <span className="font-semibold">이름</span> · {skillName}
                  </div>
                )}
              </div>
            )}

            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isTyping && <TypingIndicator />}

            {!isTyping && pending.choices && pending.choices.length > 0 && (
              <>
                <CandidatePicker candidates={pending.choices} onPick={handleSend} />
                {phase === "naming" && <CustomNameInput onSubmit={handleSend} />}
              </>
            )}

            {!isTyping && pending.summary && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSend("네, 이대로 진행해주세요!")}
                  className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.98]"
                >
                  이대로 진행하기
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

            {phase === "reviewing" && !isTyping && (
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="rounded-xl bg-success/10 px-4 py-3 text-[0.85rem] leading-relaxed text-success">
                  🎉 스킬이 완성됐어요! 준비되면 실제로 잘 답하는지 테스트해볼게요.
                </div>
                <button
                  type="button"
                  onClick={() => handleSend("네, 테스트 시작해주세요!")}
                  className="mt-3 w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
                >
                  테스트 시작하기
                </button>
              </div>
            )}

            {(phase === "testing" || phase === "improving") && (
              <>
                <SkillPreview info={skillInfo} />
                {testReport && <TestReportView report={testReport} />}
              </>
            )}

            {phase === "testing" && !isTyping && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleImprove}
                  className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
                >
                  스킬 개선하기
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  className="w-full rounded-full border border-border px-3.5 py-2.5 text-[0.85rem] font-semibold text-ink transition active:scale-[0.99]"
                >
                  개선 없이 바로 게시하기
                </button>
              </div>
            )}

            {phase === "improving" && !isTyping && (
              <button
                type="button"
                onClick={handlePublish}
                className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
              >
                완료하고 게시하기
              </button>
            )}

            {phase === "published" && (publishedSkill?.title ?? skillName) && (
              <PackagedResult
                info={skillInfo}
                version={version}
                categoryEmoji={category?.emoji ?? "🤖"}
                attachments={attachments}
                slug={slug}
              />
            )}
          </>
        )}

        {error && (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
            ⚠️ {error}
          </div>
        )}
      </div>

      <ChatInputBar
        disabled={inputDisabled}
        onSend={handleSend}
        onAttach={() => setAttachOpen(true)}
        showAttach={phase === "interviewing"}
      />

      <AttachModal open={attachOpen} onClose={() => setAttachOpen(false)} onAttach={handleAttach} />
    </div>
  );
}
