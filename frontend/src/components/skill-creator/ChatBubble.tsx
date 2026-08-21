import type { ChatMessage } from "./types";
import { AttachChip } from "./AttachChip";
import { Markdown } from "@/components/common/Markdown";

export function ChatBubble({
  message,
  agentEmoji = "🤖",
}: {
  message: ChatMessage;
  agentEmoji?: string;
}) {
  const isUser = message.role === "user";

  if (message.kind === "attachment") {
    return (
      <div className="flex justify-end" data-msg-role={message.role}>
        <AttachChip fileName={message.content} />
      </div>
    );
  }

  return (
    <div
      data-msg-role={message.role}
      className={`flex items-end gap-2 ${isUser ? "justify-end" : ""}`}
      style={{ animation: "rise 0.35s ease both" }}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm">
          {agentEmoji}
        </div>
      )}
      <div
        className={`max-w-[80%] break-words rounded-[20px] px-4 py-3 text-[0.88rem] leading-[1.65] ${
          isUser
            ? "rounded-br-md bg-primary text-on-primary"
            : "rounded-bl-md border border-border bg-surface text-ink"
        }`}
      >
        {isUser ? (
          // 사용자가 친 글은 그대로 보여준다 — 마크다운으로 해석하면 별표 같은 글자가
          // 사라진다. 대신 여러 줄 입력(Shift+Enter)이 살아있도록 줄바꿈은 유지한다.
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <Markdown text={message.content} />
        )}
      </div>
    </div>
  );
}
