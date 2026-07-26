"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  revertToStage,
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

// 각 phase가 어느 슬라이드 페이지(0-based)에 속하는지. reviewing/testing은
// 같은 5단계라 한 페이지(4)를 공유하고, 그 안에서 phase에 따라 내용만 바뀐다.
const PAGE_BY_PHASE: Record<Phase, number> = {
  category: 0,
  topicChat: 1,
  interviewing: 2,
  naming: 3,
  reviewing: 4,
  testing: 4,
  improving: 5,
  published: 6,
};

const TOTAL_PAGES = 7;

// 페이지별 고정 헤더(눈에 보이는 "STEP N · 라벨"). phase가 아니라 페이지 index 기준이라,
// 지난 페이지를 돌아볼 때도 그 페이지의 라벨이 그대로 표시된다.
const PAGE_META: { step: number; label: string }[] = [
  { step: 1, label: "카테고리 선택하기" },
  { step: 2, label: "스킬 주제 정하기" },
  { step: 3, label: "스킬 내용 정하기" },
  { step: 4, label: "스킬 이름 정하기" },
  { step: 5, label: "스킬 테스트하기" },
  { step: 6, label: "스킬 개선하기" },
  { step: 7, label: "게시" },
];

// 메시지 입력창을 띄우는 단계 = 에이전트와 대화하는 2·3·5·6단계.
// (1 카테고리·4 이름·finish는 입력창 없이 선택/버튼으로 진행 — "대화창"처럼 보이지 않게.)
// 주의: 5·6(reviewing/testing/improving)에서 보낸 자유 메시지는 skill-service가 해당
// stage에서 메시지를 받아줘야 동작한다. (BACKEND_HANDOFF.md 참고)
const CHAT_INPUT_PHASES = new Set<Phase>([
  "topicChat",
  "interviewing",
  "naming",
  "reviewing",
  "testing",
  "improving",
]);

// phase -> 되돌리기 대상 stage 문자열 (backendClient.revertToStage / BACKEND_HANDOFF.md 참고).
const STAGE_BY_PHASE: Partial<Record<Phase, string>> = {
  topicChat: "what_skill",
  interviewing: "skill_content",
  naming: "skill_name",
  reviewing: "skill_test",
  testing: "skill_test",
};

// 이전 단계로 되돌려 다시 진행하는 "수정" 기능. skill-service에 revert 엔드포인트가
// 붙기 전까지는 false로 두어 버튼을 비활성(준비 중)으로 표시한다. (BACKEND_HANDOFF.md)
const EDIT_BACK_ENABLED = false;

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

// 돌아보기용 페이지 index -> 그 페이지의 대표 phase (revert 대상 판별용).
function phaseForViewIndex(index: number): Phase {
  const map: Phase[] = [
    "category",
    "topicChat",
    "interviewing",
    "naming",
    "testing",
    "improving",
    "published",
  ];
  return map[index];
}

// 단계 마무리 시 한 번 뜨는 "정리 카드". 대화(말풍선)로 오간 내용을 별도로 반복하지 않고,
// 확정 직전에 모인 항목만 카드로 정리해 보여준다.
function SummaryCard({ info }: { info: SkillInfo }) {
  const { topic, definition, target, name } = info;
  const rows: [string, string][] = [
    ["상세 주제", topic],
    ["한 줄 정의", definition],
    ["타겟", target],
    ["이름", name],
  ];
  const visible = rows.filter(([, v]) => v);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-wide text-primary">정리</p>
      <div className="flex flex-col gap-1.5 text-[0.85rem] text-ink">
        {visible.map(([label, v]) => (
          <div key={label}>
            <span className="font-semibold">{label}</span> · {v}
          </div>
        ))}
      </div>
    </div>
  );
}

// 슬라이드 트랙 안의 한 페이지. active인 페이지에만 scrollRef를 걸어 스크롤을 그 페이지에서
// 처리하고, 나머지 페이지는 inert로 상호작용/포커스를 막는다.
// 현재 단계 라벨은 대화창 안 상단에 sticky로 고정 — 스크롤해도 계속 보인다.
function StepPage({
  meta,
  active,
  scrollRef,
  children,
}: {
  meta: { step: number; label: string };
  active: boolean;
  scrollRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <section
      ref={active ? scrollRef : undefined}
      inert={!active}
      className="flex h-full shrink-0 basis-[14.2857%] flex-col overflow-y-auto bg-bg"
    >
      <div className="sticky top-0 z-10 border-b border-border/60 bg-bg px-5 py-2.5 text-center">
        <span className="font-mono text-[0.68rem] uppercase tracking-wide text-muted">
          STEP {meta.step} · {meta.label}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5 pb-24">{children}</div>
    </section>
  );
}

// 완료되면 사용자 입력 없이 곧장 다음 단계 시작 문구까지 이어 받아오는 stage들.
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
  // 지금 화면에 보고 있는 페이지. 단계가 끝나 live가 앞서면 우측 하단 플로팅 버튼으로
  // 사용자가 직접 넘기고(자동 슬라이드 안 함), 좌측 하단 버튼으로 이전 단계를 돌아본다.
  const [viewIndex, setViewIndex] = useState(0);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // applyResponse가 재귀적으로 스스로를 이어 부를 수 있어서, React state(비동기 반영)가 아니라
  // ref(동기 반영)로 "지금까지 반영된 최신값"을 들고 있어야 직전 호출 결과를 바로 이어 읽을 수 있다.
  const skillInfoRef = useRef<SkillInfo>(EMPTY_SKILL_INFO);
  const stageRef = useRef<string>("");
  const draftIdRef = useRef<string | null>(null);
  // 메시지에 태그할 "지금 단계"를 동기적으로 들고 있는다 (user 메시지 태깅용).
  const phaseRef = useRef<Phase>("category");

  const liveIndex = PAGE_BY_PHASE[phase];
  const viewingHistory = viewIndex < liveIndex;

  // 보고 있는 페이지의 스크롤 위치: 대화 페이지(0~3)는 최신 대화가 보이게 하단으로,
  // 테스트/개선/게시(4~6)는 결과의 맨 앞부터 보이게 상단으로.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = viewIndex >= 4 ? 0 : el.scrollHeight;
  }, [messages, isTyping, phase, pending, viewIndex]);

  function nextId() {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  }

  function pushMessage(
    role: ChatMessage["role"],
    content: string,
    kind: ChatMessage["kind"] = "text",
    msgPhase: Phase = phaseRef.current
  ) {
    if (!content) return;
    setMessages((prev) => [...prev, { id: nextId(), role, kind, content, phase: msgPhase }]);
  }

  // 단계를 진행할 때 쓰는 공용 지점 — phase(state+ref)만 갱신한다. viewIndex는 건드리지
  // 않아서, 사용자가 우측 하단 버튼으로 직접 넘기기 전까지 보던 페이지에 그대로 머문다.
  function advanceTo(newPhase: Phase) {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }

  // backend 응답 하나를 화면 상태에 반영하는 공용 지점.
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

    const newPhase = phaseForStage(res.stage, merged);
    const enteringAutoStage = stageRef.current !== res.stage && AUTO_CONTINUE_STAGES.has(res.stage);
    // 자동 진행 단계로 "넘어가는" 응답의 메시지는 직전 단계의 마무리(확정) 문구다
    // (예: "좋아요, 확정할게요!"). 실제 새 단계 내용은 뒤이어 오는 auto-continue 응답이
    // 담으므로, 이 확정 문구는 이전 단계 페이지에 남긴다. 그 외에는 방금 들어선 단계로 태깅.
    const tagPhase = enteringAutoStage ? phaseRef.current : newPhase;
    for (const m of res.messages) pushMessage("agent", m, "text", tagPhase);
    setPending({ choices: res.choices, summary: res.summary });

    stageRef.current = res.stage;
    advanceTo(newPhase);

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
      // 카테고리 단계 마무리를 말풍선으로 남긴다 (상단 완료 바 대신). 1단계에 머물고
      // live가 앞서므로 우측 하단 "다음 단계" 버튼이 등장한다.
      pushMessage("agent", "다음 단계로 넘어가주세요! 👉", "text", "category");
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
      advanceTo("published");
    } catch (e) {
      setError(e instanceof Error ? e.message : "게시 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  // 돌아보던 페이지의 단계부터 다시 진행 ("이 단계부터 수정"). 백엔드 revert 준비 전까지는
  // EDIT_BACK_ENABLED=false라 호출되지 않는다 (버튼이 비활성).
  async function handleRevert(targetPhase: Phase) {
    if (!draftId) return;
    const stage = STAGE_BY_PHASE[targetPhase];
    if (!stage) return;
    setError(null);
    setIsTyping(true);
    try {
      const cutoff = PAGE_BY_PHASE[targetPhase];
      setMessages((prev) => prev.filter((m) => m.phase != null && PAGE_BY_PHASE[m.phase] < cutoff));
      setViewIndex(cutoff);
      const res = await revertToStage(draftId, stage);
      await applyResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이전 단계로 돌아가는 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  const skillName = skillInfo.name;
  const testReport = skillInfo.testReport;
  const version = category ? `skill_${category.id}_v1.0` : "";
  const slug = publishedSkill?.id ?? "";

  const liveStep = STEP_BY_PHASE[phase];
  const viewedStep = PAGE_META[viewIndex].step;

  // 특정 페이지가 지금 live(실제 진행 중) 페이지인지 — pending/typing 같은 "현재 상태"
  // UI를 그 페이지에만 그리기 위한 판별.
  const liveOn = (pageIndex: number) => liveIndex === pageIndex && !viewingHistory;
  const msgsFor = (...phases: Phase[]) =>
    messages.filter((m) => m.phase != null && phases.includes(m.phase));

  // 입력창은 대화 단계에서, 그리고 지금 live 페이지를 보고 있을 때만.
  const showInput = !viewingHistory && CHAT_INPUT_PHASES.has(phase);
  const canGoBack = viewIndex > 0;
  const canGoForward = liveIndex > viewIndex;
  const editablePhase = phaseForViewIndex(viewIndex);
  const isRevertableStep = STAGE_BY_PHASE[editablePhase] != null;
  const canEdit = EDIT_BACK_ENABLED && isRevertableStep;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="border-b border-border">
        <div className="flex items-center gap-2.5 px-5 pt-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">🤖</div>
          <div className="text-[0.95rem] font-bold">스킬 크리에이터</div>
        </div>
        <StepProgress currentStep={liveStep} viewStep={viewedStep} />
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-[700%] transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${viewIndex * (100 / TOTAL_PAGES)}%)` }}
        >
          {/* 0 · 카테고리 선택 */}
          <StepPage meta={PAGE_META[0]} active={viewIndex === 0} scrollRef={scrollRef}>
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
            {msgsFor("category").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
          </StepPage>

          {/* 1 · 상세 주제 정하기 */}
          <StepPage meta={PAGE_META[1]} active={viewIndex === 1} scrollRef={scrollRef}>
            {msgsFor("topicChat").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {isTyping && liveOn(1) && <TypingIndicator />}
            {phase === "topicChat" && !isTyping && pending.choices && pending.choices.length > 0 && (
              <CandidatePicker candidates={pending.choices} onPick={handleSend} />
            )}
            {phase === "topicChat" && !isTyping && pending.summary && (
              <>
                <SummaryCard info={skillInfo} />
                <SummaryButtons onSend={handleSend} />
              </>
            )}
          </StepPage>

          {/* 2 · 스킬 내용 채우기 */}
          <StepPage meta={PAGE_META[2]} active={viewIndex === 2} scrollRef={scrollRef}>
            {msgsFor("interviewing").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {isTyping && liveOn(2) && <TypingIndicator />}
            {phase === "interviewing" && !isTyping && pending.choices && pending.choices.length > 0 && (
              <CandidatePicker candidates={pending.choices} onPick={handleSend} />
            )}
            {phase === "interviewing" && !isTyping && pending.summary && (
              <>
                <SummaryCard info={skillInfo} />
                <SummaryButtons onSend={handleSend} />
              </>
            )}
          </StepPage>

          {/* 3 · 이름 정하기 */}
          <StepPage meta={PAGE_META[3]} active={viewIndex === 3} scrollRef={scrollRef}>
            {msgsFor("naming").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {isTyping && liveOn(3) && <TypingIndicator />}
            {/* 후보 칩(선택) — 직접 입력은 하단 입력창으로. 별도 입력칸 중복 제거. */}
            {phase === "naming" && !isTyping && pending.choices && pending.choices.length > 0 && (
              <CandidatePicker candidates={pending.choices} onPick={handleSend} />
            )}
          </StepPage>

          {/* 4 · 테스트 (준비 → 결과) */}
          <StepPage meta={PAGE_META[4]} active={viewIndex === 4} scrollRef={scrollRef}>
            {msgsFor("reviewing", "testing").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
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
            {phase === "testing" && (
              <>
                <SkillPreview info={skillInfo} />
                {testReport && <TestReportView report={testReport} />}
                {isTyping && <TypingIndicator />}
                {!isTyping && (
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
              </>
            )}
          </StepPage>

          {/* 5 · 스킬 개선 */}
          <StepPage meta={PAGE_META[5]} active={viewIndex === 5} scrollRef={scrollRef}>
            {msgsFor("improving").map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {phase === "improving" && (
              <>
                <SkillPreview info={skillInfo} />
                {testReport && <TestReportView report={testReport} />}
                {isTyping && <TypingIndicator />}
                {!isTyping && (
                  <button
                    type="button"
                    onClick={handlePublish}
                    className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
                  >
                    완료하고 게시하기
                  </button>
                )}
              </>
            )}
          </StepPage>

          {/* 6 · 게시 (finish) */}
          <StepPage meta={PAGE_META[6]} active={viewIndex === 6} scrollRef={scrollRef}>
            {phase === "published" && (publishedSkill?.title ?? skillName) && (
              <PackagedResult
                info={skillInfo}
                version={version}
                categoryEmoji={category?.emoji ?? "🤖"}
                attachments={attachments}
                slug={slug}
              />
            )}
          </StepPage>
        </div>

        {error && (
          <div className="absolute inset-x-3 top-2 z-10 rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
            ⚠️ {error}
          </div>
        )}

        {/* 좌측 하단: 이전 단계 돌아보기 (+ 지난 단계일 땐 '이 단계부터 수정' 알약) */}
        {canGoBack && (
          <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-1.5">
            {viewingHistory && isRevertableStep && (
              <button
                type="button"
                onClick={() => handleRevert(editablePhase)}
                disabled={!canEdit}
                title={canEdit ? undefined : "백엔드 준비 중"}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-ink shadow-sm disabled:opacity-50"
              >
                ✎ 수정{canEdit ? "" : " (준비 중)"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewIndex((v) => Math.max(0, v - 1))}
              aria-label="이전 단계 보기"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-lg text-ink shadow-md transition active:scale-95"
            >
              ←
            </button>
          </div>
        )}

        {/* 우측 하단: 다음 단계로 (단계 완료 시 등장, 펄스로 강조). 완료 안내 문구는 상단 바에. */}
        {canGoForward && (
          <button
            type="button"
            onClick={() => setViewIndex((v) => Math.min(liveIndex, v + 1))}
            aria-label="다음 단계로"
            className="absolute bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl text-on-primary shadow-lg transition active:scale-95"
          >
            <span
              className="pointer-events-none absolute -inset-1 rounded-full border-2 border-primary opacity-60"
              style={{ animation: "dot-ring 1.4s ease-out infinite" }}
            />
            →
          </button>
        )}
      </div>

      {showInput && (
        <ChatInputBar
          disabled={isTyping}
          onSend={handleSend}
          onAttach={() => setAttachOpen(true)}
          showAttach={phase === "interviewing"}
          placeholder={phase === "naming" ? "이름을 직접 입력하세요..." : "메시지를 입력하세요..."}
        />
      )}

      <AttachModal open={attachOpen} onClose={() => setAttachOpen(false)} onAttach={handleAttach} />
    </div>
  );
}

// 요약 확인 시 뜨는 "이대로 진행 / 더 다듬기" 버튼 쌍.
function SummaryButtons({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onSend("네, 이대로 진행해주세요!")}
        className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.98]"
      >
        이대로 진행하기
      </button>
      <button
        type="button"
        onClick={() => onSend("조금 더 다듬고 싶어요.")}
        className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.98]"
      >
        더 다듬을래요
      </button>
    </div>
  );
}
