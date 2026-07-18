"use client";

import { useState } from "react";
import { nameSuggestions } from "./types";

export function NamingStep({
  topic,
  onConfirm,
}: {
  topic: string;
  onConfirm: (name: string) => void;
}) {
  const [batchCount, setBatchCount] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const suggestions = Array.from({ length: batchCount }, (_, b) =>
    nameSuggestions(topic, b)
  ).flat();
  const hasMore = nameSuggestions(topic, batchCount).length > 0;
  const finalName = custom.trim() || selected;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[0.88rem] font-semibold">
        이제 사람들이 보게 될 이름을 붙여볼게요
      </div>
      <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
        클릭하고 싶으면서도, 무슨 스킬인지 한눈에 보이는 이름으로요.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {suggestions.map((s) => {
          const on = selected === s.name && !custom;
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => {
                setSelected(s.name);
                setCustom("");
              }}
              className={`rounded-xl border px-3.5 py-2.5 text-left transition ${
                on
                  ? "border-primary bg-primary-tint"
                  : "border-border hover:border-primary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.58rem] font-semibold ${
                    on ? "bg-primary text-on-primary" : "bg-surface-2 text-muted"
                  }`}
                >
                  {s.angle}
                </span>
                <span className="text-[0.85rem] font-semibold text-ink">
                  {s.name}
                </span>
              </div>
              <p className="mt-1 text-[0.76rem] leading-relaxed text-muted">
                {s.desc}
              </p>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setBatchCount((c) => c + 1)}
          className="mt-2 w-full rounded-xl border border-dashed border-border py-2 text-[0.8rem] font-semibold text-muted transition hover:border-primary hover:text-primary-hover"
        >
          다른 이름 더 보기 ↻
        </button>
      )}

      <div className="mt-3">
        <label className="text-[0.78rem] text-muted">
          또는 직접 이름을 지어주세요
        </label>
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setSelected(null);
          }}
          placeholder="예: 임팩트 있는 첫 문장 쓰기"
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
        />
      </div>

      <button
        type="button"
        onClick={() => finalName && onConfirm(finalName)}
        disabled={!finalName}
        className="mt-3 w-full rounded-full bg-primary px-3.5 py-2 text-[0.85rem] font-semibold text-on-primary disabled:opacity-40"
      >
        이 이름으로 할게요
      </button>
    </div>
  );
}
