"use client";

import { useEffect, useState } from "react";
import { CategoryChips } from "./CategoryChips";
import { FeedCard } from "./FeedCard";
import { getFeedCards, MOCK_HOT_QUESTION, MOCK_TRENDING } from "./feedData";
import type { FeedCard as FeedCardData } from "./types";

export function SkillFeed() {
  // null = 로딩 중, [] = 로드 완료(비어있음)와 구분한다.
  const [cards, setCards] = useState<FeedCardData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

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

  const visibleCards = cards
    ? category
      ? cards.filter((card) => card.categoryId === category)
      : cards
    : [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-base">💬</span>
        <span className="text-[0.95rem] font-bold text-ink">스킬 피드</span>
        <span className="ml-auto text-base">👤</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-bg p-3.5">
        {/* 검색바 (표시 전용 — 검색 백엔드가 아직 없음) */}
        <div className="flex shrink-0 items-center gap-2 rounded-full border-[1.5px] border-border bg-surface px-3.5 py-2.5">
          <span className="text-sm">💬</span>
          <span className="text-[0.78rem] text-muted">어떤 고민이 있으세요?</span>
        </div>

        {/* 요즘 뜨는 스킬 (가로 스크롤, 목업) */}
        <section className="flex shrink-0 flex-col gap-1.5">
          <h2 className="text-[0.72rem] font-semibold text-muted">요즘 뜨는 스킬 🔥</h2>
          <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1">
            {MOCK_TRENDING.map((item, index) => (
              <div
                key={item.id}
                className={`flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-[12px] border-[1.5px] p-2.5 ${
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
              </div>
            ))}
          </div>
        </section>

        {/* 지금 HOT 실시간 질문 (어두운 ink 배너, 목업·표시 전용) */}
        <div className="flex shrink-0 flex-col gap-1.5 rounded-[12px] bg-ink px-3 py-2.5">
          <span className="text-[0.62rem] font-semibold tracking-wide text-primary">
            ⚡ 지금 이 질문 뜨고 있어요
          </span>
          <p className="text-[0.75rem] leading-relaxed text-white">
            “{MOCK_HOT_QUESTION.question}”
          </p>
          <span className="text-[0.6rem] text-white/50">
            🛋️ 인테리어 · {MOCK_HOT_QUESTION.askedLabel}
          </span>
        </div>

        {/* 카테고리 칩 필터 (작동) */}
        <div className="shrink-0">
          <CategoryChips selected={category} onSelect={setCategory} />
        </div>

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
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            {category
              ? "이 카테고리엔 아직 스킬이 없어요."
              : "아직 등록된 스킬이 없어요."}
          </p>
        ) : (
          visibleCards.map((card) => <FeedCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}
