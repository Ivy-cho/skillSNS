"use client";

import Link from "next/link";

export function PackagedResult({
  skillName,
  version,
  category,
  categoryEmoji,
  markdown,
  slug,
}: {
  skillName: string;
  version: string;
  category: string;
  categoryEmoji: string;
  markdown: string;
  slug: string;
}) {
  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[0.9rem] font-bold">
        🎁 {skillName}
      </div>
      <div className="mt-1 font-mono text-[0.72rem] text-muted">
        {version} · 게시 준비됨 · {category}
      </div>

      <div className="mt-3 rounded-xl bg-success/10 px-4 py-3 text-[0.85rem] text-success">
        🎉 스킬이 완성됐어요! 홈에 게시하는 기능은 곧 연결돼요. 지금은 다운로드하거나 바로 사용해볼 수 있어요.
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleDownload}
          className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.97]"
        >
          ⬇ 다운로드
        </button>
        <Link
          href={`/skill/${slug}?name=${encodeURIComponent(
            skillName
          )}&category=${encodeURIComponent(
            category
          )}&emoji=${encodeURIComponent(categoryEmoji)}`}
          className="flex-1 rounded-full bg-primary px-3.5 py-2 text-center text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.97]"
        >
          스킬 사용하기 →
        </Link>
      </div>
    </div>
  );
}
