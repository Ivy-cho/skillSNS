"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "../skill-creator/ChatBubble";
import { TypingIndicator } from "../skill-creator/TypingIndicator";
import { ChatInputBar } from "../skill-creator/ChatInputBar";
import { type ChatMessage } from "../skill-creator/types";
import {
  continueChat,
  getChatSession,
  getLatestChatSession,
  getSkill,
  startChat,
  type SkillDetail,
} from "@/lib/backendClient";
import { BackButton } from "@/components/nav/BackButton";
import { ScrapButton } from "./ScrapButton";
import { CategoryChip } from "@/components/common/CategoryChip";

// 서버가 아직 분류하지 못한 스킬의 카테고리 이름. "내 스킬 넣기"로 만들면 저장은 즉시
// 끝나고 분류(LLM 호출)는 백그라운드에서 돌기 때문에, 만든 직후 잠깐 이 값이 보인다.
const UNCATEGORIZED = "미분류";
const CATEGORY_POLL_MS = 2000;
const CATEGORY_POLL_TRIES = 6; // 최대 12초쯤 기다려 본다

export function SkillUsageChat({
  skillId,
  justCreated = false,
  startNew = false,
  sessionId,
}: {
  skillId: string;
  /**
   * 스킬을 막 만들고 들어온 경우(크리에이터 게시 / 내 스킬 넣기).
   * 만들던 화면으로 되돌아가는 건 의미가 없어서, 뒤로 가기를 대화창의 계층적 부모인
   * 채팅 목록으로 보낸다 — 방금 만든 스킬이 목록 맨 위에 올라와 있다.
   */
  justCreated?: boolean;
  /**
   * 둘러보다 들어온 경우(피드 카드·트렌딩·내 스킬·스크랩). 지난 대화를 잇지 않고
   * 새 대화로 연다. 채팅 목록에서 들어올 때만 이어보기다.
   */
  startNew?: boolean;
  /** 채팅 목록에서 고른 '그 대화'. 없으면 이 스킬의 가장 최근 대화를 본다. */
  sessionId?: string;
}) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const idRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function nextId() {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  }

  function pushMessage(role: ChatMessage["role"], content: string) {
    setMessages((prev) => [...prev, { id: nextId(), role, kind: "text", content }]);
  }

  // 스킬 정보와 "지난 대화"를 함께 불러온다.
  // 이어보기(채팅 목록에서 진입)면 지난 대화를 복원하고, 그 밖에는 message 없이
  // startChat을 호출해 "오프닝 턴"(스킬이 스스로 소개하고 첫 질문을 던지는 응답)을
  // 먼저 띄운다. 사용자가 뭐라도 쳐야 스킬이 입을 여는 상태를 없애기 위해서다.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSkill(skillId),
      sessionId ? getChatSession(skillId, sessionId) : getLatestChatSession(skillId),
    ])
      .then(async ([detail, history]) => {
        if (cancelled) return;
        setSkill(detail);

        // 아직 아무 말도 안 건 대화(스킬의 오프닝 인사만 있는 상태). 새 대화를 원하더라도
        // 이건 그대로 다시 쓴다 — 안 그러면 피드에서 눌러보기만 해도 채팅 목록에
        // 빈 대화가 한 줄씩 쌓인다(서버가 세션을 스킬별로 묶지 않는다).
        const untouched =
          !!history && history.messages.length > 0 && history.messages.every((m) => m.role !== "user");

        if (history && history.messages.length > 0 && (!startNew || untouched)) {
          sessionIdRef.current = history.session_id;
          setMessages(
            history.messages.map((m) => ({
              id: nextId(),
              role: m.role === "user" ? ("user" as const) : ("agent" as const),
              kind: "text" as const,
              content: m.content,
            }))
          );
          return;
        }

        // 처음 들어온 대화 — 오프닝 턴을 받아온다. LLM 호출이라 잠깐 걸리니
        // 그동안 입력 중 표시를 띄운다.
        setIsTyping(true);
        try {
          const opening = await startChat(skillId);
          if (cancelled) return;
          sessionIdRef.current = opening.session_id;
          setMessages([
            { id: nextId(), role: "agent", kind: "text", content: opening.reply },
          ]);
        } catch (e) {
          // 오프닝을 못 받아도 대화 자체는 할 수 있어야 하니 조용히 넘어간다.
          if (!cancelled) {
            setSendError(e instanceof Error ? e.message : "스킬 소개를 불러오지 못했어요");
          }
        } finally {
          if (!cancelled) setIsTyping(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "스킬을 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
  }, [skillId, startNew, sessionId]);

  // 방금 만든 스킬은 카테고리가 아직 안 붙어 있다(백그라운드 분류). 채워지면 헤더에
  // 반영되도록 잠깐만 다시 물어본다 — 끝나면 스스로 멈춘다.
  useEffect(() => {
    if (!skill || (skill.category && skill.category !== UNCATEGORIZED)) return;
    let alive = true;
    let tries = 0;
    const timer = setInterval(async () => {
      if (++tries > CATEGORY_POLL_TRIES) {
        clearInterval(timer);
        return;
      }
      try {
        const fresh = await getSkill(skillId);
        if (!alive) return;
        if (fresh.category && fresh.category !== UNCATEGORIZED) {
          setSkill(fresh);
          clearInterval(timer);
        }
      } catch {
        // 한 번 실패해도 다음 차례에 다시 물어본다
      }
    }, CATEGORY_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [skill, skillId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  async function handleSend(text: string) {
    pushMessage("user", text);
    setSendError(null);
    setIsTyping(true);
    try {
      const res = sessionIdRef.current
        ? await continueChat(skillId, sessionIdRef.current, text)
        : await startChat(skillId, text);
      sessionIdRef.current = res.session_id;
      pushMessage("agent", res.reply);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "메시지 전송 중 오류가 발생했어요");
    } finally {
      setIsTyping(false);
    }
  }

  const emoji = skill?.category_emoji ?? "🤖";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="flex items-center gap-2 border-b border-border px-3 py-4">
        <BackButton to={justCreated ? "/chats" : undefined} />
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-bold">
            {skill?.title ?? "스킬 불러오는 중…"}
          </div>
        </div>
        {skill && (
          // 이모지는 왼쪽 아바타에 이미 있으니 여기선 이름만 보여준다.
          <CategoryChip name={skill.category} size="sm" showEmoji={false} />
        )}
        {skill && <ScrapButton skillId={skill.id} />}
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-bg p-5"
      >
        {loadError && (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
            ⚠️ {loadError}
          </div>
        )}
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} agentEmoji={emoji} />
        ))}
        {isTyping && <TypingIndicator agentEmoji={emoji} />}
        {sendError && (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
            ⚠️ {sendError}
          </div>
        )}
      </div>

      <ChatInputBar disabled={isTyping || !skill} onSend={handleSend} showAttach={false} />
    </div>
  );
}
