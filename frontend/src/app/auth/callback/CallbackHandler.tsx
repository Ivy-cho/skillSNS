"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { exchangeCodeForToken, saveSession } from "@/lib/authClient";

// 로그인 성공 후 들어갈 화면.
const AFTER_LOGIN = "/home";

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  // code는 일회용이라 (strict mode의 이펙트 2회 실행 포함) 두 번 교환하면 실패한다.
  const ranRef = useRef(false);

  // 제공자가 거부/취소하면 code 대신 error가 온다 — URL에서 바로 읽히는 값이라 렌더 중 파생.
  const denied = params.get("error_description") ?? params.get("error");
  const code = params.get("code");
  const paramError = denied ?? (code ? null : "인증 코드가 없어요. 로그인을 다시 시도해 주세요.");
  const error = paramError ?? exchangeError;

  useEffect(() => {
    if (ranRef.current || paramError) return;
    ranRef.current = true;

    (async () => {
      try {
        const token = await exchangeCodeForToken(code!);
        saveSession(token);
        router.replace(AFTER_LOGIN);
      } catch (e) {
        setExchangeError(e instanceof Error ? e.message : "로그인을 마치지 못했어요");
      }
    })();
  }, [code, paramError, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
          ⚠️ {error}
        </div>
        <Link
          href="/login"
          className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-semibold text-on-primary transition active:scale-[0.98] motion-reduce:transition-none"
        >
          로그인 화면으로
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "dot-ring 1.2s ease-out infinite" }}
      />
      <p className="text-[0.85rem] text-muted">로그인 중이에요…</p>
    </div>
  );
}
