export function PlaceholderPanel({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-dashed border-border bg-surface p-6 text-center shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xl">🚧</div>
        <div className="mt-2 text-[0.95rem] font-bold">{title}</div>
        <p className="mt-1 text-[0.82rem] text-muted">{description}</p>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
