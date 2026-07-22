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
  category: string;
  created_at: string;
};

export type SkillDetail = PublishedSkill & { md_content: string };

export type ChatResponse = {
  session_id: string | null;
  reply: string;
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

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(body.detail ?? `요청이 실패했어요 (${res.status})`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new BackendError(errBody.detail ?? `요청이 실패했어요 (${res.status})`);
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

// 게시된 스킬로 실제 대화하기 (/skill/[slug] 사용 화면).
export function getSkill(skillId: string) {
  return getJSON<SkillDetail>(`/skills/${skillId}`);
}

// 피드용 스킬 목록 (GET /skills — 공개, 인증 불필요). SkillSummary와 필드가 같아 PublishedSkill 재사용.
export function listSkills() {
  return getJSON<PublishedSkill[]>("/skills");
}

export function startChat(skillId: string, message: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}`, { message });
}

export function continueChat(skillId: string, sessionId: string, message: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}/${sessionId}`, { message });
}
