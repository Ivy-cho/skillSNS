import Link from "next/link";
import { formatCount, type FeedCard as FeedCardData } from "./types";

// 피드 카드 1개. 카드 전체를 눌러 해당 스킬 채팅(/skill/{id})으로 이동한다.
// shrink-0: 부모 스크롤 영역(flex-col, 고정 높이)에서 카드가 눌려 내용이 잘리지 않게 한다.
export function FeedCard({ card }: { card: FeedCardData }) {
  const hasQa = Boolean(card.qa.q || card.qa.a);

  return (
    <Link
      href={`/skill/${card.id}`}
      className="block shrink-0 overflow-hidden rounded-[14px] border border-border bg-surface transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-2.5 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-[0.7rem] font-semibold text-on-primary">
          {card.author.avatar}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate text-[0.72rem] font-semibold text-ink">
              {card.author.name}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[0.68rem] text-muted">
              <span aria-hidden="true">🔖</span>
              {formatCount(card.scrapCount)}
            </span>
          </div>
          <span className="text-[0.82rem] font-semibold leading-snug text-ink">
            {card.title}
          </span>
        </div>
      </div>

      {/* 백엔드 미제공 필드라 값이 없을 수 있어, 있을 때만 렌더한다. */}
      {card.comment && (
        <p className="border-b border-border px-3 pb-2.5 text-[0.75rem] leading-relaxed text-muted">
          {card.comment}
        </p>
      )}

      {hasQa && (
        <div className="flex flex-col gap-1 bg-surface-2 px-3 py-2.5">
          {card.qa.q && (
            <p className="text-[0.72rem] leading-relaxed text-ink">
              <span className="mr-1 font-bold text-primary">Q</span>
              {card.qa.q}
            </p>
          )}
          {card.qa.a && (
            <p className="text-[0.72rem] leading-relaxed text-muted">
              <span className="mr-1 font-semibold text-muted">A</span>
              {card.qa.a}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
