"use client";

import { useRouter } from "next/navigation";

// 화면 우측 상단의 뒤로 가기. 직전 화면이 있으면 그리로, 없으면(새로고침·직접 진입)
// fallback 경로로 보낸다 — 앱 밖으로 나가버리지 않게.
//
// `to`를 주면 히스토리를 보지 않고 항상 그 경로로 간다. 직전 화면으로 돌아가는 게
// 어색한 자리(예: 스킬 크리에이터로 막 게시하고 넘어온 대화창)에서 쓴다.
export function BackButton({ fallback = "/home", to }: { fallback?: string; to?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={() => {
        if (to) router.replace(to);
        else if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted transition hover:bg-surface-2 active:scale-95 motion-reduce:transition-none"
    >
      ←
    </button>
  );
}
