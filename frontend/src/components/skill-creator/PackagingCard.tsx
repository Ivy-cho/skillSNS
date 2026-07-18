export function PackagingCard({
  skillName,
  version,
  packaged,
  onTest,
  onRefine,
  onPackage,
}: {
  skillName: string;
  version: string;
  packaged: boolean;
  onTest: () => void;
  onRefine: () => void;
  onPackage: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[0.9rem] font-bold">
        🎁 {skillName}
      </div>
      <div className="mt-1 font-mono text-[0.72rem] text-muted">
        {version} · {packaged ? "packaged" : "draft"}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onTest}
          className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.97]"
        >
          테스트
        </button>
        <button
          onClick={onRefine}
          className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition active:scale-[0.97]"
        >
          스킬 확인
        </button>
        <button
          onClick={onPackage}
          disabled={packaged}
          className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary transition active:scale-[0.97] disabled:opacity-60"
        >
          패키징 완료
        </button>
      </div>
    </div>
  );
}
