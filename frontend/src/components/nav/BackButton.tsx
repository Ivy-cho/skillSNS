"use client";

import { useRouter } from "next/navigation";

// 화면 우측 상단의 뒤로 가기. 직전 화면이 있으면 그리로, 없으면(새로고침·직접 진입)
// fallback 경로로 보낸다 — 앱 밖으로 나가버리지 않게.
export function BackButton({ fallback = "/home" }: { fallback?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted transition hover:bg-surface-2 active:scale-95 motion-reduce:transition-none"
    >
      ←
    </button>
  );
}
