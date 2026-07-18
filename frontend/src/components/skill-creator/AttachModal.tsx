"use client";

import { useRef, useState } from "react";

export function AttachModal({
  open,
  onClose,
  onAttach,
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (fileName: string) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  }

  function handleConfirm() {
    if (!fileName) return;
    onAttach(fileName);
    setFileName(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[0.95rem] font-bold">자료 첨부하기</h2>
        <p className="mt-1 text-[0.82rem] text-muted">
          참고할 글이나 자료를 첨부하면 더 정교한 스킬을 만들 수 있어요.
          (md, pdf, word 지원)
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex w-full flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border py-6 text-[0.82rem] text-muted transition hover:border-primary hover:text-primary-hover"
        >
          <span className="text-xl">📎</span>
          {fileName ?? "클릭해서 파일 선택"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.pdf,.doc,.docx"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-border px-3.5 py-2 text-[0.82rem] font-semibold text-ink"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!fileName}
            className="flex-1 rounded-full bg-primary px-3.5 py-2 text-[0.82rem] font-semibold text-on-primary disabled:opacity-40"
          >
            첨부하기
          </button>
        </div>
      </div>
    </div>
  );
}
