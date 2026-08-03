"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "../skill-creator/ChatBubble";
import { TypingIndicator } from "../skill-creator/TypingIndicator";
import { ChatInputBar } from "../skill-creator/ChatInputBar";
import { CATEGORIES, type ChatMessage } from "../skill-creator/types";
import { getSkill, startChat, continueChat, type SkillDetail } from "@/lib/backendClient";
import { BackButton } from "@/components/nav/BackButton";
import { ScrapButton } from "./ScrapButton";

function emojiForCategory(category: string): string {
  return CATEGORIES.find((c) => c.label === category)?.emoji ?? "🤖";
}

export function SkillUsageChat({ skillId }: { skillId: string }) {
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

  useEffect(() => {
    let cancelled = false;
    getSkill(skillId)
      .then((detail) => {
        if (cancelled) return;
        setSkill(detail);
        pushMessage(
          "agent",
          `안녕하세요! 저는 "${detail.title}" 스킬이에요. 무엇을 도와드릴까요?`
        );
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "스킬을 불러오지 못했어요");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId]);

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

  const emoji = skill ? emojiForCategory(skill.category) : "🤖";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="flex items-center gap-2 border-b border-border px-3 py-4">
        <BackButton />
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-bold">
            {skill?.title ?? "스킬 불러오는 중…"}
          </div>
        </div>
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
