"use client";

import { type SkillContent, type SkillInfo } from "./types";

const SECTION_LABELS: { key: keyof SkillContent; label: string }[] = [
  { key: "procedure", label: "절차" },
  { key: "rules", label: "규칙" },
  { key: "checklist", label: "체크리스트" },
  { key: "cases", label: "사례" },
  { key: "knowhow", label: "노하우" },
  { key: "safety", label: "안전장치" },
  { key: "tone", label: "말투" },
];

// 보기 전용 미리보기 — 다운로드는 게시 화면의 패키지(.zip) 한 곳에서만 한다.
export function SkillPreview({ info }: { info: SkillInfo }) {
  const sections = SECTION_LABELS.filter(({ key }) => (info.content[key] ?? "").trim());

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[0.72rem] text-muted">
          📄 {info.name || "skill"}.md
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="text-[0.95rem] font-bold text-ink">{info.name}</div>
        <div className="mt-2 flex flex-col gap-1 text-[0.8rem] text-muted">
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
