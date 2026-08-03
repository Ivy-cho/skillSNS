"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthed } from "@/components/auth/AuthGate";
import { getSocialLoginUrl, isDevLoginAvailable, type Provider } from "@/lib/authClient";

// 소셜 로그인 버튼은 각 사 브랜드 가이드(배경/로고/문구)를 따른다 — 서비스 그린 액센트를
// 입히지 않는다. 로고는 외부 애셋 없이 인라인 SVG로 근사한 것이라, 실제 배포 전에는
// 카카오/구글 공식 애셋으로 교체하는 게 안전하다.
function KakaoLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3.5c-5.2 0-9.5 3.34-9.5 7.46 0 2.66 1.79 4.99 4.48 6.3l-1.02 3.73c-.09.33.28.59.57.4l4.47-2.95c.33.03.66.05 1 .05 5.25 0 9.5-3.34 9.5-7.46S17.25 3.5 12 3.5Z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const authed = useAuthed();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 이미 로그인한 상태로 들어오면 로그인 화면을 보여줄 이유가 없다 — 바로 내 홈으로.
  useEffect(() => {
    if (authed) router.replace("/home");
  }, [authed, router]);

  async function handleLogin(provider: Provider) {
    setError(null);
    setPending(provider);
    try {
      // user-service가 만들어 준 제공자 로그인 URL로 이동한다. 이후 인증이 끝나면
      // 백엔드에 설정된 CALLBACK_URL(= 이 앱의 /auth/callback)로 code와 함께 돌아온다.
      window.location.href = await getSocialLoginUrl(provider);
    } catch (e) {
      // [임시] 백엔드 CORS/설정 전이라 위 호출이 막히면, 흐름을 이어볼 수 있게 개발용 대체
      // 화면으로 보낸다. 실제 로그인이 열리면 이 폴백을 지우고 에러만 보여주면 된다.
      if (isDevLoginAvailable()) {
        router.push(`/auth/mock/${provider}`);
        return;
      }
      setError(e instanceof Error ? e.message : "로그인을 시작하지 못했어요");
      setPending(null);
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface px-7 sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
        {/* 브랜드 */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-3xl">
            🍅
          </div>
          {/* 한글 워드마크라 display(Plex Serif, 라틴 전용) 대신 본문 서체를 쓴다. */}
          <h1 className="mt-5 text-[1.8rem] font-bold tracking-tight text-ink">토마토</h1>
          <p className="mt-2.5 text-[0.88rem] leading-relaxed text-muted">
            내 노하우를 스킬로 만들고
            <br />
            사람들과 나눠보세요
          </p>
        </div>

        {/* 소셜 로그인 */}
        <div className="flex flex-col gap-2.5 pb-8">
          {error && (
            <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
              ⚠️ {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => handleLogin("kakao")}
            disabled={pending !== null}
            style={{ backgroundColor: "#FEE500", color: "rgba(0,0,0,0.85)" }}
            className="flex h-[52px] items-center justify-center gap-2 rounded-xl text-[0.92rem] font-semibold transition active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
          >
            <KakaoLogo />
            {pending === "kakao" ? "카카오로 이동 중…" : "카카오로 시작하기"}
          </button>

          <button
            type="button"
            onClick={() => handleLogin("google")}
            disabled={pending !== null}
            className="flex h-[52px] items-center justify-center gap-2 rounded-xl border border-[#747775] bg-white text-[0.92rem] font-semibold text-[#1F1F1F] transition active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
          >
            <GoogleLogo />
            {pending === "google" ? "Google로 이동 중…" : "Google로 시작하기"}
          </button>

          <p className="mt-2 text-center text-[0.72rem] leading-relaxed text-muted">
            시작하면 서비스 이용약관과
            <br />
            개인정보 처리방침에 동의하게 됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
