// 사용자 본인의 Anthropic API 키. skill-service가 계정(user_id) 단위로 암호화해서
// DB에 저장하므로, 어느 기기·브라우저에서 로그인해도 다시 입력할 필요가 없다.
// 저장 후엔 평문이 다시 클라이언트로 내려오지 않는다 — 등록 여부만 조회 가능하다
// (스킬 대화·생성 비용을 "대화하는 사람 본인 키"로 내기 위한 설계, BACKEND_HANDOFF.md 참고).

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

async function authedFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `요청이 실패했어요 (${res.status})`);
  }
  return res;
}

export async function hasAnthropicKey(token: string): Promise<boolean> {
  const res = await authedFetch("/me/anthropic-key", token);
  const data: { has_key: boolean } = await res.json();
  return data.has_key;
}

export async function saveAnthropicKey(token: string, key: string): Promise<void> {
  await authedFetch("/me/anthropic-key", token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key.trim() }),
  });
}

export async function clearAnthropicKey(token: string): Promise<void> {
  await authedFetch("/me/anthropic-key", token, { method: "DELETE" });
}
