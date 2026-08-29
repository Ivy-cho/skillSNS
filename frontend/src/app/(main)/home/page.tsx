"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getCurrentUserId, getStoredUser, logout } from "@/lib/authClient";
import { deleteSkill, listSkills, type PublishedSkill } from "@/lib/backendClient";
import { ScrapTab } from "@/components/home/ScrapTab";
import { CreateSkillSheet } from "@/components/home/CreateSkillSheet";
import { SwipeableRow } from "@/components/common/SwipeableRow";
import {
  getEmptyScraps,
  getScrapsSnapshot,
  notifySkillDeleted,
  subscribeScraps,
} from "@/lib/scrapStore";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scraps = useSyncExternalStore(subscribeScraps, getScrapsSnapshot, getEmptyScraps);

  const user = getStoredUser();
  const nickname = user?.nickname ?? "나";
  const avatarUrl = user?.avatar_url ?? null;
  const bio = user?.bio?.trim() || null;

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

  // 스킬 삭제 — 되돌릴 수 없어서 한 번 확인받는다.
  async function handleDelete(skillId: string, title: string) {
    if (!window.confirm(`"${title}" 스킬을 삭제할까요?\n삭제하면 되돌릴 수 없어요.`)) return;
    setError(null);
    setDeletingId(skillId);
    try {
      await deleteSkill(skillId);
      setSkills((prev) => prev?.filter((s) => s.id !== skillId) ?? null);
      // DB는 scraps.skill_id의 cascade로 이미 정리됐다 — 스크랩 탭 캐시(폴더 개수 포함)도 맞춰준다.
      notifySkillDeleted(skillId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스킬을 삭제하지 못했어요");
    } finally {
      setDeletingId(null);
    }
  }

  const mineCount = skills?.length ?? 0;
  const hasSkills = mineCount > 0;

  return (
    <div className="flex h-full flex-col">
      {/* 화면 제목 — 피드·채팅 목록과 같은 헤더 형식 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-base">👤</span>
        <span className="text-[0.95rem] font-bold text-ink">내 계정</span>
      </header>

      {/* 프로필 */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-tint text-2xl">
            {avatarUrl ? (
              // 아바타는 Supabase 스토리지의 임의 호스트에서 온다. next/image의 remotePatterns에
              // 환경마다 다른 호스트를 박아두는 대신 그냥 <img>로 띄운다.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              "🙂"
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[1rem] font-bold text-ink">{nickname}</div>
            <p className="mt-0.5 text-[0.78rem] leading-relaxed text-muted">
              {bio ?? "아직 소개가 없어요"}
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
              <SwipeableRow
                key={skill.id}
                actions={[
                  { label: "수정", href: `/skill/${skill.id}/edit`, tone: "primary" },
                  {
                    label: deletingId === skill.id ? "삭제 중" : "삭제",
                    onClick: () => handleDelete(skill.id, skill.title),
                    disabled: deletingId === skill.id,
                    tone: "danger",
                  },
                ]}
              >
                <Link
                  href={`/skill/${skill.id}`}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3"
                >
                <span className="flex h-9 shrink-0 items-center gap-1 rounded-[10px] bg-surface-2 px-2 text-[0.72rem] font-medium text-muted">
                  {skill.category || "미분류"}
                  <span className="text-base">{skill.category_emoji ?? "🏷️"}</span>
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
              </SwipeableRow>
            ))}

            {/* 생성 진입점은 여기 하나만. 누르면 "새로 만들기 / 내 스킬 넣기"로 갈린다. */}
            {skills !== null && (
              <div className={hasSkills ? "" : "mt-2"}>
                <CreateSkillSheet label="내 스킬 만들기" />
              </div>
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
