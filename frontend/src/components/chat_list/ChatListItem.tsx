import Link from "next/link";
import type { Conversation } from "./types";

// 대화 카드 1개. 탭하면 '이 줄이 가리키는 그 대화'가 열린다 — session을 같이 넘기지
// 않으면 서버가 그 스킬의 가장 최근 대화를 주기 때문에, 옛 대화 줄을 눌러도 최근 것이 열린다.
// shrink-0: 고정 높이 스크롤 영역에서 카드가 눌려 잘리지 않게 한다.
export function ChatListItem({ chat }: { chat: Conversation }) {
  return (
    <Link
      href={`/skill/${chat.id}?session=${chat.sessionId}`}
      className="flex shrink-0 items-start gap-3 rounded-[14px] border border-border bg-surface p-3 transition active:scale-[0.99]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg text-on-primary">
        {chat.avatar}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.82rem] font-semibold text-ink">
            {chat.skillName}
          </span>
          <span className="ml-auto shrink-0 text-[0.68rem] text-muted">
            {chat.timeLabel}
          </span>
        </div>
        {chat.summary && <p className="truncate text-[0.72rem] text-muted">{chat.summary}</p>}
        <p className="truncate text-[0.75rem] text-ink">“{chat.lastMessage}”</p>
      </div>
    </Link>
  );
}
