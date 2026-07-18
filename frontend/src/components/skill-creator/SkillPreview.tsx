"use client";

import { type SkillContent, type SkillInfo, skillMarkdown } from "./types";

const SECTION_LABELS: { key: keyof SkillContent; label: string }[] = [
  { key: "procedure", label: "절차" },
  { key: "rules", label: "규칙" },
  { key: "checklist", label: "체크리스트" },
  { key: "cases", label: "사례" },
  { key: "knowhow", label: "노하우" },
  { key: "safety", label: "안전장치" },
  { key: "tone", label: "말투" },
];

export function SkillPreview({ info }: { info: SkillInfo }) {
  const sections = SECTION_LABELS.filter(({ key }) => info.content[key].trim());

  function handleDownload() {
    const blob = new Blob([skillMarkdown(info)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${info.name || "skill"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[0.72rem] text-muted">
          📄 {info.name || "skill"}.md
        </span>
        <button
          type="button"
          onClick={handleDownload}
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[0.72rem] font-semibold text-primary-hover transition hover:border-primary active:scale-[0.97]"
        >
          ⬇ 저장
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="text-[0.95rem] font-bold text-ink">{info.name}</div>
        <div className="mt-2 flex flex-col gap-1 text-[0.8rem] text-muted">
          <div>
            <span className="font-semibold text-ink">카테고리</span> ·{" "}
            {info.category}
          </div>
          <div>
            <span className="font-semibold text-ink">주제</span> · {info.topic}
          </div>
          <div>
            <span className="font-semibold text-ink">한 줄 정의</span> ·{" "}
            {info.definition}
          </div>
          <div>
            <span className="font-semibold text-ink">타겟</span> · {info.target}
          </div>
        </div>

        {sections.length > 0 && (
          <>
            <div className="my-3 border-t border-border" />
            <div className="flex flex-col gap-3">
              {sections.map(({ key, label }) => (
                <div key={key}>
                  <div className="font-mono text-[0.68rem] uppercase tracking-wide text-primary">
                    {label}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[0.82rem] leading-relaxed text-ink">
                    {info.content[key]}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
