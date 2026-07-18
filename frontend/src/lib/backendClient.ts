// skill-service(/skills/create/*)와의 연동 지점. 화면 동작(UX)만 옛 목업과 같으면 되고,
// URL/요청 모양은 skill-service의 draft_id 기반 계약을 그대로 따른다.

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN ?? "";

export type CreationResponse = {
  draft_id: string;
  stage: string;
  messages: string[];
  skill_info: Record<string, unknown>;
  choices?: string[] | null;
  summary?: boolean;
};

export type PublishedSkill = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
};

class BackendError extends Error {}

async function postForm(path: string, form?: FormData): Promise<CreationResponse> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
    body: form ?? new FormData(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(body.detail ?? `요청이 실패했어요 (${res.status})`);
  }
  return res.json();
}

export function startDraft(category: string) {
  const form = new FormData();
  form.append("category", category);
  return postForm("/skills/create", form);
}

export function continueDraft(draftId: string, message: string, files: File[] = []) {
  const form = new FormData();
  form.append("message", message);
  for (const file of files) form.append("files", file);
  return postForm(`/skills/create/${draftId}`, form);
}

export function improveDraft(draftId: string) {
  return postForm(`/skills/create/${draftId}/improve`);
}

export function retestDraft(draftId: string) {
  return postForm(`/skills/create/${draftId}/retest`);
}

export async function confirmDraft(draftId: string): Promise<PublishedSkill> {
  const res = await fetch(`${BACKEND_URL}/skills/create/${draftId}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(body.detail ?? `확정에 실패했어요 (${res.status})`);
  }
  return res.json();
}
