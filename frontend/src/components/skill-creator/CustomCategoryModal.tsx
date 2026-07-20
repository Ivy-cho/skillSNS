"use client";

import { useState } from "react";
import type { Category } from "./types";

const EMOJI_CHOICES = [
  "🎨",
  "🎧",
  "🍳",
  "🏋️",
  "📷",
  "🌱",
  "🎮",
  "✈️",
  "🎯",
  "💡",
  "🐾",
  "🎬",
];

export function CustomCategoryModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (category: Category) => void;
}) {
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [label, setLabel] = useState("");

  if (!open) return null;

  const trimmed = label.trim();

  function handleCreate() {
    if (!trimmed) return;
    onCreate({ id: "custom", label: trimmed, emoji });
    setLabel("");
    setEmoji(EMOJI_CHOICES[0]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[0.95rem] font-bold">직접 카테고리 만들기</h2>
        <p className="mt-1 text-[0.82rem] text-muted">
          만들고 싶은 카테고리 이름과 이모지를 골라주세요.
        </p>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-outline-strong bg-surface px-5 py-3 text-[0.82rem] text-ink">
            <span className="text-2xl">{emoji}</span>
            {trimmed || "카테고리"}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[0.78rem] text-muted">이모지</label>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setEmoji(choice)}
                className={`flex h-9 items-center justify-center rounded-lg border text-xl transition ${
                  emoji === choice
                    ? "border-primary bg-primary-tint"
                    : "border-border hover:border-primary"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[0.78rem] text-muted">카테고리 이름</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="예: 사진 보정"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!trimmed}
            className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary disabled:opacity-40"
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}
