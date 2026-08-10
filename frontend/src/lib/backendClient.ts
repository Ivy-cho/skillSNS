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

// [백엔드 미구현] 이전 단계로 되돌려 그 단계부터 다시 진행하기 위한 계약.
// 스텝형 UI의 "이 단계부터 수정" 기능이 이 호출에 연결돼 있고, skill-service가
// 엔드포인트를 제공하기 전까지는 EDIT_BACK_ENABLED 플래그로 UI에서 비활성 상태다.
// 기대 동작: 해당 stage 이후로 누적된 skill_info를 버리고, 그 stage의 대화 시작
// 상태(질문 메시지 포함)를 담은 CreationResponse를 반환한다. (계약 상세: BACKEND_HANDOFF.md)
export function revertToStage(draftId: string, stage: string) {
  const form = new FormData();
  form.append("stage", stage);
  return postForm(`/skills/create/${draftId}/revert`, form);
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

// 스킬 목록 (GET /skills). user_id를 주면 그 사람 것만 — 내 홈의 "내 스킬" 탭이 이렇게 쓴다.
// 인자 없이 부르면 전체 공개 목록 — 피드가 이렇게 쓴다.
export function listSkills(userId?: string) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return getJSON<PublishedSkill[]>(`/skills${query}`);
}

export function startChat(skillId: string, message: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}`, { message });
}

export function continueChat(skillId: string, sessionId: string, message: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}/${sessionId}`, { message });
}
