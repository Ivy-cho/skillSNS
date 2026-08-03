import type { ReactNode } from "react";
import { BottomNav } from "@/components/nav/BottomNav";
import { AuthGate } from "@/components/auth/AuthGate";

// 하단 네비게이션을 공유하는 화면들(피드/채팅 목록/홈)의 공통 껍데기. 모두 로그인이 필요하다.
// 폰 목업 프레임은 스킬 크리에이터와 동일한 규칙 (모바일은 엣지투엣지, sm: 이상에서만 프레임).
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg">{children}</div>
          <BottomNav />
        </div>
      </main>
    </AuthGate>
  );
}
