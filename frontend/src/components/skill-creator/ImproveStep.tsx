"use client";

import { useState } from "react";
import type { TestReport } from "./types";

export function ImproveStep({
  report,
  onFinish,
}: {
  report: TestReport;
  onFinish: () => void;
}) {
  const lowAreas = report.diagnosis.filter((d) => d.grade <= 3);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(area: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-[0.9rem] font-bold">어디부터 손볼까요?</h3>
        <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
          테스트에서 보완이 필요하다고 나온 항목이에요. 고치고 싶은 걸 골라주세요.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {lowAreas.map((item) => {
            const on = selected.has(item.area);
            return (
              <button
                key={item.area}
                type="button"
                onClick={() => toggle(item.area)}
                className={`rounded-xl border px-3.5 py-3 text-left transition ${
                  on
                    ? "border-primary bg-primary-tint"
                    : "border-border bg-surface hover:border-primary"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.85rem] font-semibold text-ink">
                    {item.area}
                  </span>
                  <span className="font-mono text-[0.62rem] text-muted">
                    {item.gradeLabel}
                  </span>
                </div>
                <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
                  {item.suggestion}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <p className="px-1 text-[0.76rem] leading-relaxed text-muted">
        실제 개선은 스킬 내용을 만들 때처럼 대화로 하나씩 보강해요. (지금은 고칠 항목만 고르는 미리보기예요)
      </p>

      <button
        type="button"
        onClick={onFinish}
        className="w-full rounded-full bg-primary px-3.5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.99]"
      >
        {selected.size > 0
          ? `${selected.size}개 항목 보강하고 완성하기`
          : "이대로 완성하기"}
      </button>
    </div>
  );
}
