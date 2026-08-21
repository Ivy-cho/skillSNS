"use client";

import { useRef, useState, type SubmitEvent } from "react";

const MAX_ROWS = 5; // 이보다 길어지면 입력창 안에서 스크롤한다

export function ChatInputBar({
  disabled,
  onSend,
  onAttach,
  showAttach = true,
  placeholder = "메시지를 입력하세요...",
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onAttach?: () => void;
  showAttach?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // 내용에 맞춰 높이를 늘린다(최대 MAX_ROWS줄). textarea는 스스로 자라지 않는다.
  function resize() {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS)}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // 보낸 뒤엔 한 줄 높이로 되돌린다.
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.style.height = "auto";
    });
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter는 전송, Shift+Enter는 줄바꿈. 한글 조합 중(IME)에 눌린 Enter는
    // 글자를 확정하는 키라서 전송으로 보면 안 된다.
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border bg-surface px-4 py-3"
    >
      {showAttach && (
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          aria-label="파일 첨부"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 disabled:opacity-40"
        >
          📎
        </button>
      )}
      <textarea
        ref={boxRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        className="max-h-32 flex-1 resize-none overflow-y-auto rounded-[18px] bg-surface-2 px-4 py-2.5 text-base leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:opacity-60 sm:text-[0.85rem]"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="전송"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition disabled:opacity-40"
      >
        ➤
      </button>
    </form>
  );
}
