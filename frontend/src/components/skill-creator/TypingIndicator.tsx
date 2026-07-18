export function TypingIndicator({
  agentEmoji = "🤖",
}: {
  agentEmoji?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm">
        {agentEmoji}
      </div>
      <div className="flex items-center gap-1 rounded-[20px] rounded-bl-md border border-border bg-surface px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted"
            style={{
              animation: "typing-bounce 1.1s infinite ease-in-out",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
