import { Suspense } from "react";
import { CallbackHandler } from "./CallbackHandler";

// OAuth 제공자 → user-service 로그인 → 이 화면으로 code와 함께 돌아온다.
// useSearchParams는 prerender 시 Suspense 경계가 필요해서 여기서 감싼다.
export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden bg-surface px-7 sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
        <Suspense fallback={<p className="text-[0.85rem] text-muted">로그인 처리 중이에요…</p>}>
          <CallbackHandler />
        </Suspense>
      </div>
    </main>
  );
}
