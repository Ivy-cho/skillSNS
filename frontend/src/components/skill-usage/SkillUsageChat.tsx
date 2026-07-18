"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "../skill-creator/ChatBubble";
import { TypingIndicator } from "../skill-creator/TypingIndicator";
import { ChatInputBar } from "../skill-creator/ChatInputBar";
import type { ChatMessage } from "../skill-creator/types";

const TYPING_DELAY_MS = 900;

const MOCK_REPLIES = [
  "좋은 질문이에요! 조금 더 구체적으로 말씀해주시면 더 잘 도와드릴 수 있어요.",
  "그 부분은 이렇게 접근해보면 어떨까요 — 먼저 핵심부터 짚어볼게요.",
  "말씀하신 내용, 제가 배운 노하우로 정리해서 답변드릴게요.",
];

export function SkillUsageChat({
  skillName,
  category,
  emoji = "🤖",
}: {
  skillName: string;
  category: string;
  emoji?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(true);
  const idRef = useRef(0);
  const replyIndexRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  function nextId() {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  }

  function pushMessage(role: ChatMessage["role"], content: string) {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role, kind: "text", content },
    ]);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsTyping(false);
      idRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${idRef.current}`,
          role: "agent",
          kind: "text",
          content: `안녕하세요! 저는 "${skillName}" 스킬이에요. ${category} 관련해서 무엇을 도와드릴까요?`,
        },
      ]);
    }, TYPING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [skillName, category]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  function handleSend(text: string) {
    pushMessage("user", text);
    setIsTyping(true);
    window.setTimeout(() => {
      setIsTyping(false);
      const reply = MOCK_REPLIES[replyIndexRef.current % MOCK_REPLIES.length];
      replyIndexRef.current += 1;
      pushMessage("agent", reply);
    }, TYPING_DELAY_MS);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">
          {emoji}
        </div>
        <div className="flex-1">
          <div className="text-[0.95rem] font-bold">{skillName}</div>
          <div className="text-[0.75rem] text-muted">{category}</div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-bg p-5"
      >
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} agentEmoji={emoji} />
        ))}
        {isTyping && <TypingIndicator agentEmoji={emoji} />}
      </div>

      <ChatInputBar disabled={isTyping} onSend={handleSend} showAttach={false} />
    </div>
  );
}
