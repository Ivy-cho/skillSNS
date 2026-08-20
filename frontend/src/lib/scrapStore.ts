// 스크랩 폴더와 담긴 스킬을 보관하는 곳.
//
// skill-service의 /scrap, /scrap/folders API와 연동한다 (계약: BACKEND_HANDOFF.md).
// 화면은 이 파일의 함수만 쓴다. 네트워크 왕복을 기다리지 않도록 로컬 캐시를 먼저
// 낙관적으로 갱신하고 백엔드 호출은 뒤에서 진행한다 — 실패하면 캐시를 되돌린다.
//
// React에서 읽을 땐 useSyncExternalStore를 쓴다. 서버 렌더에선 빈 목록, 클라이언트에서
// 백엔드 응답이 도착하면 다시 렌더돼 최신 값으로 바뀐다. 스냅샷은 같은 참조를 유지하도록
// 캐시해 둔다(매번 새 배열을 주면 무한 렌더가 된다).

import { getAccessToken } from "@/lib/authClient";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export type ScrapFolder = {
  id: string;
  name: string;
  createdAt: string;
  // 폴더 안 스킬 개수. 백엔드가 DB에서 매번 다시 세어 내려주는 값을 그대로 쓴다 —
  // 담긴 스킬 자체가 삭제되면(DB가 cascade로 scrap도 함께 지움) 그 수만큼 줄어야 하므로,
  // 화면은 이 값만 보고 별도로 scraps 배열 길이를 세지 않는다.
  skillCount: number;
};

export type Scrap = {
  skillId: string;
  folderId: string;
  addedAt: string;
};

type FolderDTO = { id: string; name: string; created_at: string; skill_count: number };
type ScrapDTO = { skill_id: string; folder_id: string; added_at: string };

const EMPTY_FOLDERS: ScrapFolder[] = [];
const EMPTY_SCRAPS: Scrap[] = [];

let folderCache: ScrapFolder[] = EMPTY_FOLDERS;
let scrapCache: Scrap[] = EMPTY_SCRAPS;
let loaded = false;
let loading: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function setFolders(folders: ScrapFolder[]) {
  folderCache = folders;
  notify();
}

function setScraps(scraps: Scrap[]) {
  scrapCache = scraps;
  notify();
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `요청이 실패했어요 (${res.status})`);
  }
  return res;
}

async function load() {
  try {
    const [folderRes, scrapRes] = await Promise.all([
      authedFetch("/scrap/folders"),
      authedFetch("/scrap"),
    ]);
    const folders: FolderDTO[] = await folderRes.json();
    const scraps: ScrapDTO[] = await scrapRes.json();
    folderCache = folders.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.created_at,
      skillCount: f.skill_count,
    }));
    scrapCache = scraps.map((s) => ({ skillId: s.skill_id, folderId: s.folder_id, addedAt: s.added_at }));
    loaded = true;
    notify();
  } catch {
    // 조회 실패 — loaded를 세우지 않아 다음 subscribe/getSnapshot에서 재시도된다.
  }
}

function ensureLoaded() {
  if (loaded || loading || typeof window === "undefined") return;
  loading = load().finally(() => {
    loading = null;
  });
}

export function subscribeScraps(cb: () => void) {
  ensureLoaded();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ---- 스냅샷 (useSyncExternalStore용) ----
export function getFoldersSnapshot(): ScrapFolder[] {
  ensureLoaded();
  return folderCache;
}
export function getScrapsSnapshot(): Scrap[] {
  ensureLoaded();
  return scrapCache;
}
export const getEmptyFolders = () => EMPTY_FOLDERS;
export const getEmptyScraps = () => EMPTY_SCRAPS;

function tempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- 폴더 ----
// 실제 id는 서버 응답으로 확정된다 — 반환된 폴더를 곧바로 addScrap에 넘겨도 되도록
// (호출부가 await 하는 한) 낙관적 임시 id가 새어나가지 않는다.
export async function createFolder(name: string): Promise<ScrapFolder> {
  const trimmed = name.trim();
  const optimistic: ScrapFolder = {
    id: tempId(),
    name: trimmed,
    createdAt: new Date().toISOString(),
    skillCount: 0,
  };
  setFolders([...folderCache, optimistic]);
  try {
    const res = await authedFetch("/scrap/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const dto: FolderDTO = await res.json();
    const real: ScrapFolder = {
      id: dto.id,
      name: dto.name,
      createdAt: dto.created_at,
      skillCount: dto.skill_count,
    };
    setFolders(folderCache.map((f) => (f.id === optimistic.id ? real : f)));
    return real;
  } catch (err) {
    setFolders(folderCache.filter((f) => f.id !== optimistic.id));
    throw err;
  }
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  const before = folderCache;
  setFolders(folderCache.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
  try {
    await authedFetch(`/scrap/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
  } catch (err) {
    setFolders(before);
    throw err;
  }
}

// 폴더를 지우면 그 안의 스크랩도 함께 정리한다 (백엔드도 cascade로 동일하게 처리).
export async function deleteFolder(id: string): Promise<void> {
  const beforeFolders = folderCache;
  const beforeScraps = scrapCache;
  setFolders(folderCache.filter((f) => f.id !== id));
  setScraps(scrapCache.filter((s) => s.folderId !== id));
  try {
    await authedFetch(`/scrap/folders/${id}`, { method: "DELETE" });
  } catch (err) {
    setFolders(beforeFolders);
    setScraps(beforeScraps);
    throw err;
  }
}

function bumpSkillCount(folderId: string, delta: number) {
  setFolders(
    folderCache.map((f) =>
      f.id === folderId ? { ...f, skillCount: Math.max(0, f.skillCount + delta) } : f
    )
  );
}

// ---- 스크랩 ----
// 한 스킬은 폴더 하나에만 담긴다 — 다시 담으면 폴더를 옮기는 셈(백엔드도 동일 규칙).
export async function addScrap(skillId: string, folderId: string): Promise<void> {
  const beforeScraps = scrapCache;
  const beforeFolders = folderCache;
  const prev = scrapCache.find((s) => s.skillId === skillId);
  const rest = scrapCache.filter((s) => s.skillId !== skillId);
  setScraps([...rest, { skillId, folderId, addedAt: new Date().toISOString() }]);
  if (prev?.folderId !== folderId) {
    if (prev) bumpSkillCount(prev.folderId, -1);
    bumpSkillCount(folderId, 1);
  }
  try {
    await authedFetch("/scrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId, folder_id: folderId }),
    });
  } catch (err) {
    setScraps(beforeScraps);
    setFolders(beforeFolders);
    throw err;
  }
}

export async function removeScrap(skillId: string): Promise<void> {
  const beforeScraps = scrapCache;
  const beforeFolders = folderCache;
  const prev = scrapCache.find((s) => s.skillId === skillId);
  setScraps(scrapCache.filter((s) => s.skillId !== skillId));
  if (prev) bumpSkillCount(prev.folderId, -1);
  try {
    await authedFetch(`/scrap/${skillId}`, { method: "DELETE" });
  } catch (err) {
    setScraps(beforeScraps);
    setFolders(beforeFolders);
    throw err;
  }
}

// 스킬 자체가 삭제됐을 때(홈 "내 스킬" 삭제) 호출. DB는 scraps.skill_id의
// ON DELETE CASCADE로 이미 정리되므로, 로컬 캐시도 재조회 없이 곧장 맞춰준다.
export function notifySkillDeleted(skillId: string): void {
  const scrap = scrapCache.find((s) => s.skillId === skillId);
  if (!scrap) return;
  setScraps(scrapCache.filter((s) => s.skillId !== skillId));
  bumpSkillCount(scrap.folderId, -1);
}
