"use client";

import { useState, useSyncExternalStore } from "react";
import {
  addScrap,
  createFolder,
  getEmptyFolders,
  getEmptyScraps,
  getFoldersSnapshot,
  getScrapsSnapshot,
  removeScrap,
  subscribeScraps,
} from "@/lib/scrapStore";

// 스킬을 폴더에 담는 버튼. 누르면 폴더를 고르는 시트가 열린다.
export function ScrapButton({ skillId }: { skillId: string }) {
  const folders = useSyncExternalStore(subscribeScraps, getFoldersSnapshot, getEmptyFolders);
  const scraps = useSyncExternalStore(subscribeScraps, getScrapsSnapshot, getEmptyScraps);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const current = scraps.find((s) => s.skillId === skillId);
  const scrapped = Boolean(current);

  function pick(folderId: string) {
    addScrap(skillId, folderId).catch(() => {});
    setOpen(false);
  }

  async function handleCreateAndPick() {
    const name = newName.trim();
    if (!name) return;
    try {
      const folder = await createFolder(name);
      await addScrap(skillId, folder.id);
    } catch {
      // 실패 시 scrapStore가 낙관적 갱신을 자동으로 되돌린다.
    }
    setNewName("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={scrapped ? "스크랩 폴더 바꾸기" : "스크랩하기"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base transition hover:bg-surface-2 active:scale-95 motion-reduce:transition-none ${
          scrapped ? "text-primary" : "text-muted"
        }`}
      >
        {scrapped ? "🔖" : "🏷️"}
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
              <span className="text-[0.9rem] font-bold text-ink">폴더에 담기</span>
              {scrapped && (
                <button
                  type="button"
                  onClick={() => {
                    removeScrap(skillId);
                    setOpen(false);
                  }}
                  className="text-[0.76rem] text-muted underline underline-offset-2"
                >
                  스크랩 해제
                </button>
              )}
            </div>

            <div className="mt-3 flex max-h-[220px] flex-col gap-2 overflow-y-auto">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => pick(folder.id)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-[0.85rem] transition active:scale-[0.99] ${
                    current?.folderId === folder.id
                      ? "border-primary bg-primary-tint text-primary-hover"
                      : "border-border bg-surface text-ink"
                  }`}
                >
                  <span>📁</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
                  {current?.folderId === folder.id && <span className="shrink-0">✓</span>}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndPick()}
                placeholder="새 폴더 이름"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
              />
              <button
                type="button"
                onClick={handleCreateAndPick}
                disabled={!newName.trim()}
                className="shrink-0 rounded-lg bg-primary px-3.5 text-[0.8rem] font-semibold text-on-primary disabled:opacity-40"
              >
                만들어 담기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
