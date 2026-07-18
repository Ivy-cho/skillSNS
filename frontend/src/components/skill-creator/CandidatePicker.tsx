export function CandidatePicker({
  candidates,
  onPick,
}: {
  candidates: string[];
  onPick: (candidate: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {candidates.map((candidate, i) => (
        <button
          key={`${candidate}-${i}`}
          type="button"
          onClick={() => onPick(candidate)}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-tint font-mono text-[0.7rem] font-semibold text-primary-hover">
            {i + 1}
          </span>
          <span className="flex-1 text-[0.85rem] text-ink">{candidate}</span>
          {i === 0 && (
            <span className="shrink-0 rounded-full bg-primary-tint px-2 py-0.5 font-mono text-[0.6rem] font-semibold text-primary-hover">
              추천
            </span>
          )}
          <span className="shrink-0 text-muted">▸</span>
        </button>
      ))}
    </div>
  );
}
