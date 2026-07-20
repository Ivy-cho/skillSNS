"use client";

import Link from "next/link";
import { useState } from "react";
import { type SkillInfo, skillMarkdown } from "./types";

// 완성 스킬을 하나의 패키지(zip)로 묶어 내려준다.
//   skill.md          스킬 본문 (사람이 읽는 최종본)
//   skill_info.json   누적 데이터
//   test_report.json  테스트 진단서 (있을 때만)
//   attachments/      만들 때 첨부한 원본 파일들
async function buildZip(info: SkillInfo, version: string, attachments: File[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  zip.file("skill.md", skillMarkdown(info));
  zip.file("skill_info.json", JSON.stringify({ ...info, version }, null, 2));
  if (info.testReport) {
    zip.file("test_report.json", JSON.stringify(info.testReport, null, 2));
  }

  if (attachments.length > 0) {
    const dir = zip.folder("attachments")!;
    for (const f of attachments) dir.file(f.name, f);
  }

  return zip.generateAsync({ type: "blob" });
}

export function PackagedResult({
  info,
  version,
  categoryEmoji,
  attachments,
  slug,
}: {
  info: SkillInfo;
  version: string;
  categoryEmoji: string;
  attachments: File[];
  slug: string;
}) {
  const [zipping, setZipping] = useState(false);

  async function handleDownload() {
    setZipping(true);
    try {
      const blob = await buildZip(info, version, attachments);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${info.name || "skill"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[0.9rem] font-bold">🎁 {info.name}</div>
      <div className="mt-1 font-mono text-[0.72rem] text-muted">
        {version} · 게시 완료 · {info.category}
      </div>

      <div className="mt-3 rounded-xl bg-success/10 px-4 py-3 text-[0.85rem] text-success">
        🎉 스킬을 게시했어요! 패키지(zip)로 저장하거나 바로 사용해볼 수 있어요.
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleDownload}
          disabled={zipping}
          className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.97] disabled:opacity-40"
        >
          {zipping ? "묶는 중…" : "⬇ 패키지 저장 (.zip)"}
        </button>
        <Link
          href={`/skill/${slug}`}
          className="flex-1 rounded-full bg-primary px-3.5 py-2 text-center text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.97]"
        >
          💬 내 스킬 사용해보기 →
        </Link>
      </div>

      <div className="mt-2 text-center text-[0.72rem] text-muted">
        {categoryEmoji} {info.category}
      </div>
    </div>
  );
}
