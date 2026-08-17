import Link from "next/link";
import type { Conversation } from "./types";

// 대화 카드 1개. 탭하면 그 스킬 채팅(/skill/{id})으로 이동한다.
// shrink-0: 고정 높이 스크롤 영역에서 카드가 눌려 잘리지 않게 한다.
export function ChatListItem({ chat }: { chat: Conversation }) {
  return (
    <Link
      href={`/skill/${chat.id}`}
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
