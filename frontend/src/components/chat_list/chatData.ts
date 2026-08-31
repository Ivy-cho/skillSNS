// 채팅 목록 데이터 접근자. skill-service GET /chat/sessions를 호출한다.
// 백엔드는 "요약(summary)"을 따로 만들어주지 않으므로 요약 줄은 비워 두고,
// ChatListItem이 비어있으면 알아서 숨긴다(마지막 메시지만 보여준다).

import { listChatSessions } from "@/lib/backendClient";
import { toPlainText } from "@/components/common/markdownText";
import type { Conversation } from "./types";

// ISO 시각 → "방금"/"3시간 전"/"어제"/"3일 전"/"1주 전" 같은 상대 표기.
function toTimeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const weeks = Math.floor(days / 7);
  return `${weeks}주 전`;
}

// 대화 목록.
export async function getChats(): Promise<Conversation[]> {
  const sessions = await listChatSessions();
  return sessions.map((s) => ({
    id: s.skill_id,
    skillName: s.skill_title,
    avatar: s.category_emoji ?? "🏷️",
    summary: "",
    // 에이전트 답변은 마크다운이라 그대로 두면 "# 제목 --- **[값]**"처럼 보인다.
    // 목록에선 한 줄로 눌러 담아야 해서 기호를 벗긴다.
    lastMessage: toPlainText(s.last_message),
    timeLabel: toTimeLabel(s.last_message_at),
  }));
}
