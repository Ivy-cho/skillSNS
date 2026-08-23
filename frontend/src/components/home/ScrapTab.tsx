"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createFolder,
  deleteFolder,
  getEmptyFolders,
  getEmptyScraps,
  getFoldersSnapshot,
  getScrapsSnapshot,
  removeScrap,
  renameFolder,
  subscribeScraps,
} from "@/lib/scrapStore";
import { listSkills, type PublishedSkill } from "@/lib/backendClient";
import { SwipeableRow } from "@/components/common/SwipeableRow";

export function ScrapTab() {
  const folders = useSyncExternalStore(subscribeScraps, getFoldersSnapshot, getEmptyFolders);
  const scraps = useSyncExternalStore(subscribeScraps, getScrapsSnapshot, getEmptyScraps);

  // 담긴 스킬의 제목·설명을 보여주려면 스킬 정보가 필요하다 (내 것뿐 아니라 남의 것도).
  const [allSkills, setAllSkills] = useState<PublishedSkill[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    let alive = true;
    listSkills()
      .then((list) => {
        if (alive) setAllSkills(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const skillById = new Map(allSkills.map((s) => [s.id, s]));

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createFolder(name).catch(() => {});
    setNewName("");
    setAdding(false);
  }

  // ---- 폴더 안 (담긴 스킬 목록) ----
  const openFolder = folders.find((f) => f.id === openId);
  if (openFolder) {
    const items = scraps
      .filter((s) => s.folderId === openFolder.id)
      .map((s) => skillById.get(s.skillId))
      .filter((s): s is PublishedSkill => Boolean(s));

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            aria-label="폴더 목록으로"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 active:scale-95"
          >
            ←
          </button>
          <span className="min-w-0 flex-1 truncate text-[0.9rem] font-bold text-ink">
            📁 {openFolder.name}
          </span>
          <span className="font-mono text-[0.68rem] text-muted">{openFolder.skillCount}</span>
        </div>

        {items.length === 0 ? (
          <p className="py-8 text-center text-[0.8rem] leading-relaxed text-muted">
            아직 담은 스킬이 없어요
            <br />
            스킬 대화 화면에서 🔖를 눌러 담아보세요
          </p>
        ) : (
          items.map((skill) => (
            <SwipeableRow
              key={skill.id}
              actions={[
                {
                  label: "빼기",
                  onClick: () => removeScrap(skill.id).catch(() => {}),
                  tone: "danger",
                },
              ]}
            >
              <Link
                href={`/skill/${skill.id}`}
                className="block rounded-2xl border border-border bg-surface p-3"
              >
                <span className="block text-[0.85rem] font-semibold leading-snug text-ink">
                  {skill.title}
                </span>
                {skill.description && (
                  <span className="mt-0.5 block line-clamp-2 text-[0.76rem] leading-relaxed text-muted">
                    {skill.description}
                  </span>
                )}
              </Link>
            </SwipeableRow>
          ))
        )}
      </div>
    );
  }

  // ---- 폴더 목록 ----
  return (
    <div className="flex flex-col gap-2">
      {folders.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="text-2xl">📁</span>
          <p className="text-[0.85rem] font-semibold text-ink">아직 스크랩한 스킬이 없어요</p>
          <p className="text-[0.78rem] leading-relaxed text-muted">
            폴더를 만들어 마음에 드는 스킬을 모아보세요
          </p>
        </div>
      )}

      {folders.map((folder) =>
        renamingId === folder.id ? (
          <div key={folder.id} className="flex gap-2 rounded-2xl border border-border bg-surface p-2.5">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.82rem]"
            />
            <button
              type="button"
              onClick={() => {
                if (renameValue.trim()) renameFolder(folder.id, renameValue).catch(() => {});
                setRenamingId(null);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 text-[0.78rem] font-semibold text-on-primary"
            >
              확인
            </button>
          </div>
        ) : (
          <SwipeableRow
            key={folder.id}
            actions={[
              {
                label: "편집",
                onClick: () => {
                  setRenamingId(folder.id);
                  setRenameValue(folder.name);
                },
                tone: "primary",
              },
              {
                label: "삭제",
                onClick: () => deleteFolder(folder.id).catch(() => {}),
                tone: "danger",
              },
            ]}
          >
            <button
              type="button"
              onClick={() => setOpenId(folder.id)}
              className="flex w-full items-center gap-2 rounded-2xl border border-border bg-surface p-3 text-left"
            >
              <span className="shrink-0 text-base">📁</span>
              <span className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold text-ink">
                {folder.name}
              </span>
              <span className="shrink-0 font-mono text-[0.68rem] text-muted">
                {folder.skillCount}
              </span>
            </button>
          </SwipeableRow>
        )
      )}

      {adding ? (
        <div className="flex gap-2 rounded-2xl border border-border bg-surface p-2.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="폴더 이름 (예: 면접 준비)"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.82rem]"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="shrink-0 rounded-lg bg-primary px-3 text-[0.78rem] font-semibold text-on-primary disabled:opacity-40"
          >
            만들기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border py-4 text-[0.85rem] font-semibold text-muted transition active:scale-[0.99]"
        >
          ＋ 폴더 만들기
        </button>
      )}
    </div>
  );
}
