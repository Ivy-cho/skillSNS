"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { hasSession } from "@/lib/authClient";

// 로그인 여부는 localStorage(외부 저장소)에 있어 서버 렌더에선 알 수 없다. useSyncExternalStore로
// 읽으면 서버/첫 렌더에선 null(확인 전), 클라이언트에서 실제 값으로 다시 렌더된다 —
// hydration 불일치 없이 "아직 모름" 상태를 표현할 수 있다.
const subscribe = () => () => {};

export function useAuthed(): boolean | null {
  return useSyncExternalStore(subscribe, hasSession, () => null);
}

function Checking() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "dot-ring 1.2s ease-out infinite" }}
      />
    </main>
  );
}

// 로그인이 필요한 화면을 감싼다. 세션이 없으면 로그인 화면으로 보낸다.
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const authed = useAuthed();

  useEffect(() => {
    if (authed === false) router.replace("/login");
  }, [authed, router]);

  if (authed !== true) return <Checking />;
  return <>{children}</>;
}
