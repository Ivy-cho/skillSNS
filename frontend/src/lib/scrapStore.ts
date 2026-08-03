// 스크랩 폴더와 담긴 스킬을 보관하는 곳.
//
// [백엔드 미구현] skill-service/user-service 어디에도 스크랩·폴더 기능이 없어서, 우선
// 브라우저(localStorage)에 저장한다. 화면 쪽은 이 파일의 함수만 쓰므로, 백엔드 API가
// 생기면 이 파일의 구현만 fetch 호출로 바꾸면 된다. (계약: BACKEND_HANDOFF.md)
//
// React에서 읽을 땐 useSyncExternalStore를 쓴다 — 서버 렌더에선 빈 목록, 클라이언트에서
// 실제 값으로 다시 렌더돼 hydration 불일치가 없다. 그래서 스냅샷은 같은 참조를 유지하도록
// 캐시해 둔다(매번 새 배열을 주면 무한 렌더가 된다).

export type ScrapFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type Scrap = {
  skillId: string;
  folderId: string;
  addedAt: string;
};

const FOLDER_KEY = "skillsns.scrapFolders";
const SCRAP_KEY = "skillsns.scraps";

const EMPTY_FOLDERS: ScrapFolder[] = [];
const EMPTY_SCRAPS: Scrap[] = [];

let folderCache: ScrapFolder[] = EMPTY_FOLDERS;
let scrapCache: Scrap[] = EMPTY_SCRAPS;
let loaded = false;

const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  folderCache = read(FOLDER_KEY, EMPTY_FOLDERS);
  scrapCache = read(SCRAP_KEY, EMPTY_SCRAPS);
  loaded = true;
}

function commit(folders: ScrapFolder[], scraps: Scrap[]) {
  folderCache = folders;
  scrapCache = scraps;
  if (typeof window !== "undefined") {
    localStorage.setItem(FOLDER_KEY, JSON.stringify(folders));
    localStorage.setItem(SCRAP_KEY, JSON.stringify(scraps));
  }
  listeners.forEach((l) => l());
}

export function subscribeScraps(cb: () => void) {
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

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- 폴더 ----
export function createFolder(name: string): ScrapFolder {
  ensureLoaded();
  const folder: ScrapFolder = {
    id: newId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  commit([...folderCache, folder], scrapCache);
  return folder;
}

export function renameFolder(id: string, name: string) {
  ensureLoaded();
  commit(
    folderCache.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)),
    scrapCache
  );
}

// 폴더를 지우면 그 안의 스크랩도 함께 정리한다.
export function deleteFolder(id: string) {
  ensureLoaded();
  commit(
    folderCache.filter((f) => f.id !== id),
    scrapCache.filter((s) => s.folderId !== id)
  );
}

// ---- 스크랩 ----
// 한 스킬은 폴더 하나에만 담긴다 — 다시 담으면 폴더를 옮기는 셈.
export function addScrap(skillId: string, folderId: string) {
  ensureLoaded();
  const rest = scrapCache.filter((s) => s.skillId !== skillId);
  commit(folderCache, [...rest, { skillId, folderId, addedAt: new Date().toISOString() }]);
}

export function removeScrap(skillId: string) {
  ensureLoaded();
  commit(
    folderCache,
    scrapCache.filter((s) => s.skillId !== skillId)
  );
}
