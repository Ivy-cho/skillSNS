"use client";

import Link from "next/link";
import { useState } from "react";

// "내 스킬 만들기" 진입점. 누르면 두 갈래로 나뉜다.
//  - 새로운 스킬 만들기: 에이전트와 대화하며 처음부터 (/create)
//  - 내 스킬 넣기: 이미 갖고 있는 프롬프트를 직접 입력 (/skill/new)
export function CreateSkillSheet({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-primary py-4 text-[0.85rem] font-semibold text-primary-hover transition active:scale-[0.99] motion-reduce:transition-none"
      >
        ＋ {label}
      </button>

      {open && (
        <div
          className="absolute inset-0 z-20 flex items-end bg-ink/20"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-[20px] border-t border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[0.9rem] font-bold text-ink">어떻게 만들까요?</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[0.76rem] text-muted underline underline-offset-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/create"
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 transition active:scale-[0.99] motion-reduce:transition-none"
              >
                <span className="text-lg">💬</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.88rem] font-semibold text-ink">
                    새로운 스킬 만들기
                  </span>
                  <span className="mt-0.5 block text-[0.76rem] leading-relaxed text-muted">
                    질문에 답하다 보면 스킬이 완성돼요
                  </span>
                </span>
              </Link>

              <Link
                href="/skill/new"
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 transition active:scale-[0.99] motion-reduce:transition-none"
              >
                <span className="text-lg">📝</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.88rem] font-semibold text-ink">내 스킬 넣기</span>
                  <span className="mt-0.5 block text-[0.76rem] leading-relaxed text-muted">
                    이미 쓰고 있는 프롬프트를 직접 등록해요
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
