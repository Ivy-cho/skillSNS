"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

// [임시 · 개발 전용] 소셜 로그인 자리 표시자.
//
// 실제로는 이 지점에서 카카오/구글이 호스팅하는 로그인 화면으로 "이동"한다 — 우리가 만드는
// 화면이 아니다. 다만 지금은 user-service의 CORS/CALLBACK_URL 설정 전이라 그 이동 자체가
// 막혀서 이후 흐름(콜백 → 내 홈)을 걸어볼 수 없다. 그래서 그 자리를 대신하는 화면을 둔다.
// 실제 로그인이 열리면 이 라우트와 로그인 화면의 폴백을 함께 지운다.
const PROVIDER_LABEL: Record<string, string> = {
  kakao: "카카오",
  google: "Google",
};

export default function MockAuthPage() {
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const provider = params?.provider ?? "";
  const label = PROVIDER_LABEL[provider] ?? provider;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface px-7 sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="rounded-full bg-warning/15 px-3 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-wide text-warning">
            개발용 대체 화면
          </span>
          <h1 className="mt-4 text-[1.15rem] font-bold text-ink">
            여기서 {label} 로그인 화면이 열려요
          </h1>
          <p className="mt-2.5 text-[0.83rem] leading-relaxed text-muted">
            실제로는 {label}이(가) 제공하는 로그인 화면으로
            <br />
            이동해 계정을 확인합니다.
            <br />
            <br />
            지금은 서버 설정(CORS·리디렉션 주소)이
            <br />
            아직이라 이 화면으로 대신 보여주고 있어요.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pb-8">
          <button
            type="button"
            onClick={() => router.replace("/auth/callback?mock=1")}
            className="flex h-[50px] items-center justify-center rounded-xl bg-primary text-[0.9rem] font-bold text-on-primary transition active:scale-[0.98] motion-reduce:transition-none"
          >
            로그인했다고 치고 계속하기
          </button>
          <Link
            href="/login"
            className="flex h-[46px] items-center justify-center rounded-xl border border-border bg-surface text-[0.88rem] font-semibold text-ink transition active:scale-[0.98] motion-reduce:transition-none"
          >
            취소
          </Link>
        </div>
      </div>
    </main>
  );
}
