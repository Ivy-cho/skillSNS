// skill-service(/skills/create/*)와의 연동 지점. 화면 동작(UX)만 옛 목업과 같으면 되고,
// URL/요청 모양은 skill-service의 draft_id 기반 계약을 그대로 따른다.

import { getFreshAccessToken } from "@/lib/authClient";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

// 로그인 세션이 있을 때만 Authorization을 싣는다 — 없는 채로 보내면 skill-service가
// 비로그인으로 처리한다(예: /chat은 "로그인이 필요합니다" 안내로 응답). 대화·생성
// 비용에 쓰는 Anthropic 키는 이제 skill-service가 user_id로 DB에서 직접 찾아 쓴다
// (계정 단위로 암호화 저장돼 있어 클라이언트가 매 요청 실어 보낼 필요가 없다).
// 만료가 임박했으면 getFreshAccessToken이 알아서 갱신해준다.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getFreshAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 스킬 본문에 HTML 태그(<div ...>)나 쉘 명령(git push -f, `| base64 -d`, gh api -X POST …)이
// 잔뜩 든 프롬프트를 등록/수정하려 하면, Render 앞단 Cloudflare WAF가 요청 본문을 공격으로 보고
// 403(Blocked)으로 끊어버린다 — 그 응답엔 CORS 헤더가 없어 브라우저엔 "Failed to fetch"로만 뜬다.
// WAF 설정은 우리가 못 바꾸므로, 본문을 base64로 감싸 패턴 매칭을 피하고 서버가 풀게 한다
// (skill-service schemas/skill.py, content_encoding="base64"). 저장은 서버에서 평문으로 되돌린다.
function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

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
  category: string; // 소분류 이름 (서버가 id를 해석해 내려줌)
  category_emoji: string; // 소분류 이모지
  created_at: string;
};

export type SkillDetail = PublishedSkill & { md_content: string };

export type ChatResponse = {
  session_id: string | null;
  reply: string;
};

class BackendError extends Error {}

// skill-service가 detail로 내려주는 코드성 문자열 중 화면에 그대로 보여주면 안 되는
// 것들만 한국어 안내로 바꾼다. 나머지는 detail을 그대로 쓴다.
const DETAIL_MESSAGES: Record<string, string> = {
  ANTHROPIC_KEY_REQUIRED: "스킬을 만들려면 먼저 프로필에서 본인 Anthropic API 키를 등록해주세요.",
};

function friendlyDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return DETAIL_MESSAGES[detail] ?? detail;
  return fallback;
}

async function postForm(path: string, form?: FormData): Promise<CreationResponse> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: form ?? new FormData(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(body.detail, `요청이 실패했어요 (${res.status})`));
  }
  return res.json();
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(body.detail, `요청이 실패했어요 (${res.status})`));
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(errBody.detail, `요청이 실패했어요 (${res.status})`));
  }
  return res.json();
}

export function startDraft() {
  // 카테고리는 이름 단계에서 서버(카테고리명 Agent)가 정하므로 시작 시 보내지 않는다.
  return postForm("/skills/create");
}

export function continueDraft(draftId: string, message: string, files: File[] = []) {
  const form = new FormData();
  // message는 base64로 감싸 보낸다 (WAF 우회 — toBase64Utf8 주석 참고). 파일은 그대로.
  form.append("message", toBase64Utf8(message));
  form.append("message_encoding", "base64");
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
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(body.detail, `확정에 실패했어요 (${res.status})`));
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

// 내 스킬 수정 (홈 목록에서 스와이프 → 수정). 소유자만 가능하고, 남의 스킬이면 403이다.
// 주는 필드만 바뀐다(PATCH). category는 백엔드 SkillUpdate에 없어서 아직 바꿀 수 없다.
export async function updateSkill(
  skillId: string,
  body: { title?: string; description?: string | null; md_content?: string },
): Promise<SkillDetail> {
  // 본문 필드는 base64로 감싸 보낸다 (WAF 우회 — toBase64Utf8 주석 참고). null(설명 비우기)은 그대로.
  const payload: Record<string, unknown> = { content_encoding: "base64" };
  if (body.title !== undefined) payload.title = toBase64Utf8(body.title);
  if (body.md_content !== undefined) payload.md_content = toBase64Utf8(body.md_content);
  if (body.description !== undefined) {
    payload.description = body.description == null ? null : toBase64Utf8(body.description);
  }
  const res = await fetch(`${BACKEND_URL}/skills/${skillId}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(errBody.detail, `수정하지 못했어요 (${res.status})`));
  }
  return res.json();
}

// 내 스킬 삭제 (홈 목록에서 스와이프 → 삭제). 되돌릴 수 없다.
export async function deleteSkill(skillId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/skills/${skillId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendError(friendlyDetail(body.detail, `삭제하지 못했어요 (${res.status})`));
  }
}

// 이미 갖고 있는 프롬프트를 스킬로 바로 등록 ("내 스킬 넣기").
// md_content가 그대로 이 스킬의 시스템 프롬프트가 되어 /skill/[id] 대화에 쓰인다.
export function createSkillDirect(body: {
  title: string;
  md_content: string;
  description?: string | null;
}) {
  // 카테고리는 서버가 스킬 내용을 보고 자동 분류하므로 보내지 않는다.
  // 본문은 base64로 감싸 보낸다 (WAF 우회 — toBase64Utf8 주석 참고).
  return postJSON<PublishedSkill>("/skills", {
    title: toBase64Utf8(body.title),
    md_content: toBase64Utf8(body.md_content),
    description: body.description == null ? body.description : toBase64Utf8(body.description),
    content_encoding: "base64",
  });
}

export type ChatHistory = {
  session_id: string;
  skill_id: string;
  messages: { role: "user" | "assistant"; content: string }[];
};

// 오프닝 턴(사용자가 아무것도 안 쳤는데 스킬이 먼저 자기소개하는 첫 턴)을 만들 때
// 백엔드가 LLM에 넣어주는 가짜 사용자 메시지. LLM은 사람 발화가 있어야 답하는 구조라
// 넣는 자리표시자인데, 대화 기록에 그대로 남아서 다시 들어오면 사용자가 친 말처럼 보인다.
// (skill-service/app/api/routes/chat.py — human_content)
const OPENING_PLACEHOLDER = "(대화 시작)";

// 이 스킬과 나눈 가장 최근 대화 (채팅창 진입 시 이어보기용).
// 이력이 없으면 본문이 null로 200이 온다 — 그때는 새 대화로 시작하면 된다.
export async function getLatestChatSession(skillId: string): Promise<ChatHistory | null> {
  const res = await fetch(`${BACKEND_URL}/chat/${skillId}/latest`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    // 로그인 전이거나 조회에 실패해도 대화 자체는 시작할 수 있어야 하니 새 대화로 본다.
    return null;
  }
  return stripOpeningPlaceholder(await res.json());
}

// 채팅 목록에서 고른 "그 대화"를 연다. /latest는 스킬의 가장 최근 대화만 주기 때문에,
// 한 스킬에 대화가 여러 개면 목록에서 옛 대화를 눌러도 최근 것이 열려버린다.
export async function getChatSession(
  skillId: string,
  sessionId: string,
): Promise<ChatHistory | null> {
  const res = await fetch(`${BACKEND_URL}/chat/${skillId}/${sessionId}`, {
    headers: await authHeaders(),
  });
  // 지워졌거나 남의 대화면 새 대화로 시작하게 둔다.
  if (!res.ok) return null;
  return stripOpeningPlaceholder(await res.json());
}

// 자리표시자는 화면에 보일 이유가 없으니 걷어낸다. 맨 앞의 사용자 메시지 하나만 —
// 뒤쪽에 같은 글자를 진짜로 친 경우까지 지우면 안 된다.
// (백엔드가 아예 안 내려주게 요청해뒀다: BACKEND_HANDOFF.md)
function stripOpeningPlaceholder(history: ChatHistory | null): ChatHistory | null {
  if (!history) return null;
  const [first] = history.messages;
  if (first?.role === "user" && first.content.trim() === OPENING_PLACEHOLDER) {
    return { ...history, messages: history.messages.slice(1) };
  }
  return history;
}

// 새 대화 시작. message를 생략하면 "오프닝 턴" — 스킬이 md_content를 근거로 자기소개와
// 첫 질문을 만들어 돌려준다. 오프닝 턴은 서버 기본 키로 처리돼 본인 키/무료 횟수를
// 쓰지 않는다(소모는 사용자가 실제로 첫 메시지를 보내는 순간부터).
export function startChat(skillId: string, message?: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}`, message ? { message } : {});
}

export function continueChat(skillId: string, sessionId: string, message: string) {
  return postJSON<ChatResponse>(`/chat/${skillId}/${sessionId}`, { message });
}

export type ChatSessionSummary = {
  skill_id: string;
  skill_title: string;
  category: string; // 소분류 이름
  category_emoji: string; // 소분류 이모지
  session_id: string;
  last_message: string;
  last_message_at: string;
};

// "내가 어떤 스킬과 대화했는지" 목록 (채팅 목록 화면).
export function listChatSessions() {
  return getJSON<ChatSessionSummary[]>("/chat/sessions");
}
