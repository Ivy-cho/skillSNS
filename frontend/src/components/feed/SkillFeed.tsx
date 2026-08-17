"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeedCard } from "./FeedCard";
import { getFeedCards, toTrending } from "./feedData";
import type { FeedCard as FeedCardData } from "./types";
import { CATEGORIES } from "../skill-creator/types";

// 검색은 불러온 피드 카드 안에서 걸러낸다 — 아직 검색 전용 API가 없어서다.
// 제목·소개·작성자·카테고리 이름을 훑는다.
function matches(card: FeedCardData, q: string): boolean {
  const categoryLabel = CATEGORIES.find((c) => c.id === card.categoryId)?.label ?? card.categoryId;
  return [card.title, card.comment, card.author.name, categoryLabel]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function SkillFeed() {
  // null = 로딩 중, [] = 로드 완료(비어있음)와 구분한다.
  const [cards, setCards] = useState<FeedCardData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 마운트 시 카드 로드 (지금은 목업, 백엔드 붙으면 getFeedCards 내부만 교체).
  useEffect(() => {
    let cancelled = false;
    getFeedCards()
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch(() => {
        // 실데이터(listSkills) 스왑 후 네트워크/API 실패 시 조용히 빈 화면이 되지 않도록.
        if (!cancelled) {
          setLoadError("피드를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allCards = cards ?? [];
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  // 검색 중이면 걸러낸 결과만, 아니면 전체.
  const visibleCards = searching ? allCards.filter((c) => matches(c, q)) : allCards;
  // 트렌딩은 전체에서 뽑는다(검색 중에는 감춘다 — 결과에 집중하도록).
  const trending = toTrending(allCards);

  return (
    // 폰 프레임(테두리·높이·라운드)은 (main)/layout.tsx가 감싸주므로 여기선 내용만 채운다.
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-base">💬</span>
        <span className="text-[0.95rem] font-bold text-ink">스킬 피드</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-bg p-3.5">
        {/* 검색 — 불러온 카드 안에서 걸러낸다(검색 전용 API는 아직 없음) */}
        <div className="flex shrink-0 items-center gap-2 rounded-full border-[1.5px] border-border bg-surface px-3.5 py-2.5 focus-within:border-primary">
          <span className="text-sm">💬</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어떤 고민이 있으세요?"
            aria-label="스킬 검색"
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none sm:text-[0.78rem]"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="shrink-0 text-[0.8rem] text-muted"
            >
              ✕
            </button>
          )}
        </div>

        {/* 요즘 뜨는 스킬 (가로 스크롤) — 조회수 상위 4개. 검색 중엔 결과에 집중하도록 감춘다. */}
        {!searching && trending.length > 0 && (
        <section className="flex shrink-0 flex-col gap-1.5">
          <h2 className="text-[0.72rem] font-semibold text-muted">요즘 뜨는 스킬 🔥</h2>
          <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1">
            {trending.map((item, index) => (
              // item.id가 스킬 id라 그대로 대화 화면으로 연결한다.
              <Link
                key={item.id}
                href={`/skill/${item.id}`}
                className={`flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-[12px] border-[1.5px] p-2.5 transition active:scale-[0.97] motion-reduce:transition-none ${
                  index === 0
                    ? "border-primary bg-primary-tint"
                    : "border-border bg-surface"
                }`}
              >
                <span className="text-xl">{item.emoji}</span>
                <span className="text-center text-[0.66rem] font-semibold leading-tight text-ink">
                  {item.title}
                </span>
                <span className="text-[0.6rem] text-muted">{item.author}</span>
              </Link>
            ))}
          </div>
        </section>
        )}

        {/* 피드 카드: 에러 → 로딩 → 빈 상태 → 목록 순으로 구분해 렌더 */}
        {loadError ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            {loadError}
          </p>
        ) : cards === null ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            불러오는 중…
          </p>
        ) : visibleCards.length === 0 ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] leading-relaxed text-muted">
            {searching ? (
              <>
                &quot;{query.trim()}&quot;와 맞는 스킬이 없어요
                <br />
                다른 말로 찾아보세요
              </>
            ) : (
              "아직 등록된 스킬이 없어요."
            )}
          </p>
        ) : (
          visibleCards.map((card) => <FeedCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}
