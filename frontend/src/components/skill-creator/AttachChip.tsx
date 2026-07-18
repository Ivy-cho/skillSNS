export function AttachChip({ fileName }: { fileName: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 self-end rounded-full bg-info-tint px-3 py-1.5 text-[0.78rem] font-semibold text-info">
      📎 {fileName}
    </div>
  );
}
