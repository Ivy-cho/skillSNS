"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedCard } from "./FeedCard";
import { getFeedCards, toTrending } from "./feedData";
import type { FeedCard as FeedCardData } from "./types";

// 검색어를 칠 때마다 요청하지 않도록 잠깐 기다린다.
const SEARCH_DEBOUNCE_MS = 300;

export function SkillFeed() {
  const [query, setQuery] = useState("");
  // 실제 요청에 쓰는 검색어 — query가 멈춘 뒤에야 따라온다.
  const [searchTerm, setSearchTerm] = useState("");

  // 결과를 "어느 검색어의 것인지"와 함께 들고 있는다. 이러면 검색어가 바뀐 순간을
  // 렌더 중에 알 수 있어서, 이펙트 안에서 목록을 비우는 setState를 하지 않아도 된다.
  // (cards === null = 아직 첫 페이지 로딩 중, [] = 로드 완료·결과 없음)
  const [result, setResult] = useState<{
    term: string;
    cards: FeedCardData[] | null;
    hasMore: boolean;
    error: string | null;
  }>({ term: "", cards: null, hasMore: false, error: null });

  const [loadingMore, setLoadingMore] = useState(false);

  // 검색어가 막 바뀌었으면 아직 옛 결과가 담겨 있으므로 로딩으로 취급한다.
  const fresh = result.term === searchTerm;
  const cards = fresh ? result.cards : null;
  const hasMore = fresh && result.hasMore;
  const loadError = fresh ? result.error : null;

  // 트렌딩은 검색 결과가 아니라 "전체 피드 상위"라서 검색과 별개로 한 번만 받아둔다.
  const [trending, setTrending] = useState<FeedCardData[]>([]);

  const searching = searchTerm.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // 트렌딩용 첫 페이지 (검색과 무관하게 마운트 시 1회).
  useEffect(() => {
    let cancelled = false;
    getFeedCards()
      .then(({ cards }) => {
        if (!cancelled) setTrending(cards);
      })
      .catch(() => {
        /* 트렌딩은 없어도 피드는 보여준다 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 검색어가 바뀌면 처음부터 다시 받는다.
  useEffect(() => {
    let cancelled = false;
    getFeedCards({ q: searchTerm })
      .then(({ cards, hasMore }) => {
        if (!cancelled) setResult({ term: searchTerm, cards, hasMore, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({
          term: searchTerm,
          cards: [],
          hasMore: false,
          error: "피드를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || cards === null) return;
    setLoadingMore(true);
    try {
      const next = await getFeedCards({ q: searchTerm, offset: cards.length });
      setResult((prev) => ({
        ...prev,
        cards: [...(prev.cards ?? []), ...next.cards],
        hasMore: next.hasMore,
      }));
    } catch {
      // 더 받다 실패하면 이미 받은 것까지는 그대로 보여준다
      setResult((prev) => ({ ...prev, hasMore: false }));
    } finally {
      setLoadingMore(false);
    }
  }, [cards, hasMore, loadingMore, searchTerm]);

  // 목록 끝에 둔 감시 지점이 보이면 다음 페이지를 부른다.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const trendingItems = toTrending(trending);

  return (
    // 폰 프레임(테두리·높이·라운드)은 (main)/layout.tsx가 감싸주므로 여기선 내용만 채운다.
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-base">💬</span>
        <span className="text-[0.95rem] font-bold text-ink">스킬 피드</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-bg p-3.5">
        {/* 검색 — 서버(GET /feed?q=)가 제목·소개·카테고리·작성자를 찾아준다 */}
        <div className="flex shrink-0 items-center gap-2 rounded-full border-[1.5px] border-border bg-surface px-3.5 py-2.5 focus-within:border-primary">
          <span className="text-sm">💬</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어떤 고민이 있으세요?"
            aria-label="스킬 검색"
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none sm:text-[0.78rem]"
          />
          {query && (
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
        {!searching && trendingItems.length > 0 && (
          <section className="flex shrink-0 flex-col gap-1.5">
            <h2 className="text-[0.72rem] font-semibold text-muted">요즘 뜨는 스킬 🔥</h2>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1">
              {trendingItems.map((item, index) => (
                // item.id가 스킬 id라 그대로 대화 화면으로 연결한다.
                <Link
                  key={item.id}
                  href={`/skill/${item.id}`}
                  className={`flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-[12px] border-[1.5px] p-2.5 transition active:scale-[0.97] motion-reduce:transition-none ${
                    index === 0 ? "border-primary bg-primary-tint" : "border-border bg-surface"
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
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">{loadError}</p>
        ) : cards === null ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">불러오는 중…</p>
        ) : cards.length === 0 ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] leading-relaxed text-muted">
            {searching ? (
              <>
                &quot;{searchTerm}&quot;와 맞는 스킬이 없어요
                <br />
                다른 말로 찾아보세요
              </>
            ) : (
              "아직 등록된 스킬이 없어요."
            )}
          </p>
        ) : (
          <>
            {cards.map((card) => (
              <FeedCard key={card.id} card={card} />
            ))}
            {/* 여기가 보이면 다음 페이지를 부른다 */}
            <div ref={sentinelRef} className="h-1 shrink-0" />
            {loadingMore && (
              <p className="shrink-0 py-3 text-center text-[0.74rem] text-muted">
                더 불러오는 중…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
