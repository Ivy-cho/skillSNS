import { Fragment, type ReactNode } from "react";
import type { ChatMessage } from "./types";
import { AttachChip } from "./AttachChip";

// 에이전트 메시지에 섞여 오는 **볼드** 마크다운을 실제 볼드로 바꾸고(별표는 제거),
// 줄바꿈/문단을 살려 가독성 있게 렌더한다.
function renderRichText(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    // 빈 줄은 문단 사이 여백으로.
    if (trimmed === "") return <span key={i} className="block h-2" />;

    // **볼드** 구간을 <strong>으로.
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <span key={i} className="block">
        {parts.map((seg, j) =>
          seg.startsWith("**") && seg.endsWith("**") ? (
            <strong key={j} className="font-semibold">
              {seg.slice(2, -2)}
            </strong>
          ) : (
            <Fragment key={j}>{seg}</Fragment>
          )
        )}
      </span>
    );
  });
}

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
        {renderRichText(message.content)}
      </div>
    </div>
  );
}
