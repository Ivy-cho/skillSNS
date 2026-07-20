import type { ChatMessage } from "./types";
import { AttachChip } from "./AttachChip";

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
      <div className="flex justify-end">
        <AttachChip fileName={message.content} />
      </div>
    );
  }

  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "justify-end" : ""}`}
      style={{ animation: "rise 0.35s ease both" }}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm">
          {agentEmoji}
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-[20px] px-3.5 py-2.5 text-[0.88rem] leading-relaxed ${
          isUser
            ? "rounded-br-md bg-primary text-on-primary"
            : "rounded-bl-md border border-border bg-surface text-ink"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
