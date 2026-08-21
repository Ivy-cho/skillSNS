// user-service(/auth/*)와의 연동 지점. 소셜 로그인은 Supabase OAuth를 user-service가
// 감싸고 있어서, 프론트는 (1) 로그인 URL을 받아 이동시키고 (2) 돌아온 code를 토큰으로
// 교환하는 두 단계만 담당한다. 계약: user-service/app/api/routes/auth.py

const USER_SERVICE_URL =
  process.env.NEXT_PUBLIC_USER_SERVICE_URL ?? "http://localhost:8001";

export type Provider = "kakao" | "google";

export type UserInfo = {
  id: string;
  email: string;
  nickname: string;
  provider: string;
  created_at: string;
  // [백엔드 미구현] 프로필 편집용 필드 — User 테이블에 아직 컬럼이 없어 optional.
  bio?: string | null;
  avatar_url?: string | null;
};

export type ProfilePatch = {
  nickname?: string;
  bio?: string;
  avatar_url?: string | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
};

class AuthError extends Error {}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${USER_SERVICE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AuthError(body.detail ?? `요청이 실패했어요 (${res.status})`);
  }
  return res.json();
}

// 1단계: 제공자별 로그인 URL 받기 → 이 URL로 브라우저를 보낸다.
export async function getSocialLoginUrl(provider: Provider): Promise<string> {
  const { login_url } = await getJSON<{ login_url: string }>(`/auth/login/${provider}`);
  return login_url;
}

// 2단계: OAuth 후 돌아온 code를 우리 서비스 토큰으로 교환.
export function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  return getJSON<TokenResponse>(`/auth/callback?code=${encodeURIComponent(code)}`);
}

export function getMe(accessToken: string): Promise<UserInfo> {
  return getJSON<UserInfo>("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// [백엔드 미구현] 프로필 수정 계약. user-service에 PATCH /auth/me 와 users.bio /
// users.avatar_url 컬럼이 생기면 PROFILE_SAVE_ENABLED를 켜서 활성화한다.
// (계약 상세: BACKEND_HANDOFF.md)
export function updateProfile(accessToken: string, patch: ProfilePatch): Promise<UserInfo> {
  return getJSON<UserInfo>("/auth/me", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

// [백엔드 미구현] 프로필 사진 업로드 계약 — 업로드된 파일의 접근 URL을 돌려준다.
export async function uploadAvatar(accessToken: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { avatar_url } = await getJSON<{ avatar_url: string }>("/auth/me/avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return avatar_url;
}

// 저장된 세션의 사용자 정보만 갱신 (프로필 편집 후 화면 반영용).
export function updateStoredUser(user: UserInfo) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ---- 토큰 보관 (로컬 전용) ----
// 로그인 UI를 붙이는 단계라 우선 localStorage에 둔다. XSS에 노출되는 방식이라, 실서비스
// 전에는 httpOnly 쿠키로 옮기는 걸 백엔드와 함께 검토해야 한다. (BACKEND_HANDOFF.md)
const ACCESS_KEY = "skillsns.access_token";
const REFRESH_KEY = "skillsns.refresh_token";
const USER_KEY = "skillsns.user";

export function saveSession(token: TokenResponse) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, token.access_token);
  localStorage.setItem(REFRESH_KEY, token.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(token.user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

// ---- 액세스 토큰 자동 갱신 ----
// 액세스 토큰은 60분이면 만료되고, refresh token은 7일간 산다. 갱신을 안 하면 로그인
// 한 시간 뒤부터 인증이 필요한 요청이 전부 실패한다(사진 업로드·폴더 만들기는 401,
// 스킬 대화는 401이 아니라 "로그인이 필요합니다" 안내 문구가 돌아와서 더 헷갈린다).
// 그래서 401을 보고 재시도하는 대신, 요청을 보내기 전에 만료가 임박했으면 미리 갱신한다.

const REFRESH_MARGIN_MS = 60_000; // 만료 1분 전부터는 미리 갱신한다

// JWT payload의 exp(초)를 읽는다. 서명은 검증하지 않는다 — 만료 시각만 보면 되고,
// 진짜 판정은 어차피 서버가 한다.
function expiryOf(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// 동시에 여러 요청이 갱신을 시도해도 실제 호출은 한 번만 나가게 한다.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const { access_token } = await getJSON<{ access_token: string; expires_in: number }>(
      "/auth/refresh",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    localStorage.setItem(ACCESS_KEY, access_token);
    return access_token;
  } catch {
    // refresh token까지 죽었다 = 다시 로그인해야 한다. 세션을 비우면 AuthGate가
    // /login으로 보낸다. 여기서 라우팅까지 하지는 않는다(이 파일은 화면을 모른다).
    clearSession();
    return null;
  }
}

// 인증이 필요한 요청은 이걸로 토큰을 얻는다. 만료가 임박했으면 갱신해서 돌려준다.
export async function getFreshAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;

  const expiresAt = expiryOf(token);
  if (expiresAt !== null && expiresAt - Date.now() > REFRESH_MARGIN_MS) return token;

  refreshing ??= refreshAccessToken().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function getStoredUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

// 로그인 여부 — 실제 세션만 본다. (화면 진입/가드 판정에 쓰인다)
export function hasSession(): boolean {
  return getStoredUser() !== null;
}

// 데이터를 불러올 때 쓸 사용자 id. 세션이 있을 때만 값이 있다.
export function getCurrentUserId(): string | null {
  return getStoredUser()?.id ?? null;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function logout() {
  const token = getAccessToken();
  clearSession();
  if (!token) return;
  // 서버 쪽 refresh token도 정리 — 실패해도 로컬 세션은 이미 비웠으므로 무시한다.
  await fetch(`${USER_SERVICE_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
