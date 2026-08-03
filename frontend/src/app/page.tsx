"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthed } from "@/components/auth/AuthGate";

// 앱 진입점 — 화면을 직접 그리지 않고, 로그인 여부만 보고 갈 곳을 정한다.
// 로그인했으면 내 홈, 아니면 로그인 화면.
export default function EntryPage() {
  const router = useRouter();
  const authed = useAuthed();

  useEffect(() => {
    if (authed === null) return; // 아직 확인 전
    router.replace(authed ? "/home" : "/login");
  }, [authed, router]);

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "dot-ring 1.2s ease-out infinite" }}
      />
    </main>
  );
}
