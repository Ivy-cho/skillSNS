"use client";

import { useState, type SubmitEvent } from "react";

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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border bg-surface px-4 py-3"
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
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 rounded-full bg-surface-2 px-4 py-2.5 text-base text-ink placeholder:text-muted focus:outline-none disabled:opacity-60 sm:text-[0.85rem]"
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
