"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getCurrentUserId, getStoredUser, logout } from "@/lib/authClient";
import { listSkills, type PublishedSkill } from "@/lib/backendClient";
import { CATEGORIES } from "@/components/skill-creator/types";
import { ScrapTab } from "@/components/home/ScrapTab";
import { getEmptyScraps, getScrapsSnapshot, subscribeScraps } from "@/lib/scrapStore";

// 스킬 만들기 화면
const CREATE_HREF = "/create";

function emojiFor(category: string) {
  return CATEGORIES.find((c) => c.label === category)?.emoji ?? "🍅";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

type Tab = "mine" | "scrap";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [skills, setSkills] = useState<PublishedSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scraps = useSyncExternalStore(subscribeScraps, getScrapsSnapshot, getEmptyScraps);

  const user = getStoredUser();
  const nickname = user?.nickname ?? "나";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const userId = getCurrentUserId();
        const list = await listSkills(userId ?? undefined);
        if (alive) setSkills(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "스킬을 불러오지 못했어요");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mineCount = skills?.length ?? 0;
  const hasSkills = mineCount > 0;

  return (
    <div className="flex h-full flex-col">
      {/* 프로필 */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          {/* 프로필 사진은 아직 백엔드에 필드가 없어 기본 아바타로 둔다. */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-tint text-2xl">
            🙂
          </div>
          <div className="min-w-0">
            <div className="truncate text-[1rem] font-bold text-ink">{nickname}</div>
            <p className="mt-0.5 text-[0.78rem] leading-relaxed text-muted">
              아직 소개가 없어요
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex gap-2">
          <Link
            href="/profile/edit"
            className="flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface text-[0.8rem] font-semibold text-ink transition active:scale-[0.98] motion-reduce:transition-none"
          >
            ✎ 프로필 편집
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="flex h-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-surface px-4 text-[0.8rem] font-semibold text-muted transition active:scale-[0.98] motion-reduce:transition-none"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-border">
        {(
          [
            { key: "mine", label: `내 스킬 ${mineCount}` },
            { key: "scrap", label: `스크랩 ${scraps.length || ""}`.trim() },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "true" : undefined}
            className={`flex-1 border-b-2 px-2 pb-2.5 pt-3 text-[0.85rem] font-semibold transition-colors ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "mine" ? (
          <div className="flex flex-col gap-2">
            {error && (
              <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.82rem] leading-relaxed text-error">
                ⚠️ {error}
              </div>
            )}

            {skills === null && !error && (
              <p className="py-6 text-center text-[0.82rem] text-muted">불러오는 중…</p>
            )}

            {skills?.map((skill) => (
              <Link
                key={skill.id}
                href={`/skill/${skill.id}`}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 transition active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-base">
                  {emojiFor(skill.category)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.85rem] font-semibold leading-snug text-ink">
                    {skill.title}
                  </span>
                  {skill.description && (
                    <span className="mt-0.5 block line-clamp-2 text-[0.76rem] leading-relaxed text-muted">
                      {skill.description}
                    </span>
                  )}
                  <span className="mt-1.5 block font-mono text-[0.64rem] text-muted">
                    {formatDate(skill.created_at)}
                  </span>
                </span>
              </Link>
            ))}

            {/* 생성 버튼은 여기 하나만. 스킬이 없으면 "새 스킬 만들기", 있으면 "하나 더". */}
            {skills !== null && (
              <Link
                href={CREATE_HREF}
                className={`flex items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-primary py-4 text-[0.85rem] font-semibold text-primary-hover transition active:scale-[0.99] ${
                  hasSkills ? "" : "mt-2"
                }`}
              >
                ＋ {hasSkills ? "스킬 하나 더 만들기" : "새 스킬 만들기"}
              </Link>
            )}

            {skills !== null && !hasSkills && (
              <p className="mt-1 text-center text-[0.78rem] leading-relaxed text-muted">
                내 노하우를 스킬로 만들어 보세요
              </p>
            )}
          </div>
        ) : (
          <ScrapTab />
        )}
      </div>
    </div>
  );
}
