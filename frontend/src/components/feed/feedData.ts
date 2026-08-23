// 피드 데이터 접근자. feed-service(GET /feed)를 호출한다. 트렌딩 칩은 별도 API 없이
// 불러온 카드에서 클라이언트가 직접 정렬해 뽑는다(toTrending) — 조회수 내림차순,
// 조회수가 같으면 스킬 이름 오름차순(가나다순).
//
// 카테고리는 skill-creator의 실제 CATEGORIES 6개(글쓰기/인테리어/커리어/재테크/바이브 코딩/기타)
// id를 그대로 쓴다. Q&A(대표 질답 미리보기)는 저장되는 데이터가 아니라 아직 없다 — FeedCard가
// 빈 값이면 알아서 숨긴다.

import { CATEGORIES, categoryMeta } from "../skill-creator/types";
import type { FeedCard, TrendingItem } from "./types";

const FEED_SERVICE_URL = process.env.NEXT_PUBLIC_FEED_SERVICE_URL ?? "";

// feed-service GET /feed 응답 1건 (계약: feed-service/app/schemas/feed.py FeedItem).
type FeedItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  user_id: string;
  author_nickname: string;
  // 작성자가 등록한 프로필 사진. feed-service가 아직 안 내려주는 동안은 undefined라
  // 이름 축약 라벨로 대체된다. (요청: BACKEND_HANDOFF.md)
  author_avatar_url?: string | null;
  scrap_count: number;
  view_count: number;
  created_at: string;
};

// 피드 카드 목록에서 상위 n개를 뽑아 트렌딩 칩으로 쓴다. 정렬 규칙: 조회수 내림차순,
// 조회수가 같으면 스킬 이름 오름차순(가나다순). 별도 API 없이 이미 불러온 카드에서
// 파생하는 값이라 getFeedCards()와 같은 자리에 둔다.
export function toTrending(cards: FeedCard[], n = 4): TrendingItem[] {
  return [...cards]
    .sort((a, b) => b.viewCount - a.viewCount || a.title.localeCompare(b.title, "ko"))
    .slice(0, n)
    .map((c) => ({
      id: c.id,
      emoji: c.emoji,
      title: c.title,
      author: c.author.name,
      categoryId: c.categoryId,
    }));
}

// feed-service 응답(FeedItem) → 피드 카드 매퍼.
// 네트워크 경계라 타입이 보장되지 않으므로 누락 필드도 방어적으로 처리한다.
export function toFeedCard(item: FeedItem): FeedCard {
  // 백엔드 category는 한글 라벨("인테리어")이라 필터용 id("interior")로 변환한다.
  // CATEGORIES(6개, "기타"=custom 포함)에서 라벨로 찾고, 없으면 원본 라벨을 그대로 둔다.
  const matched = CATEGORIES.find((c) => c.label === item.category);
  const nickname = item.author_nickname || "익명";
  return {
    id: item.id,
    categoryId: matched?.id ?? item.category,
    // 직접 만든 카테고리("🎨 사진 보정")면 사용자가 고른 이모지를 그대로 쓴다.
    emoji: categoryMeta(item.category, "🔥").emoji,
    title: item.title,
    author: {
      name: nickname,
      avatar: nickname.slice(0, 2),
      avatarUrl: item.author_avatar_url ?? null,
    },
    comment: item.description ?? "",
    qa: { q: "", a: "" },
    scrapCount: item.scrap_count,
    viewCount: item.view_count,
  };
}

// 한 페이지에 받아올 개수. 백엔드 GET /feed의 limit 기본값과 같다.
export const FEED_PAGE_SIZE = 20;

// 피드 카드 한 페이지. 검색(q)·페이징(limit/offset)은 서버가 처리한다 —
// 제목·소개·카테고리·작성자 닉네임을 DB에서 ILIKE로 찾는다.
// 총 개수는 안 내려오므로, 받은 개수가 limit과 같으면 다음 페이지가 있다고 본다.
// feed-service가 없거나 응답이 실패하면 그대로 던진다 — SkillFeed가 에러 문구를 보여준다.
export async function getFeedCards({
  q = "",
  limit = FEED_PAGE_SIZE,
  offset = 0,
}: { q?: string; limit?: number; offset?: number } = {}): Promise<{
  cards: FeedCard[];
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);

  const res = await fetch(`${FEED_SERVICE_URL}/feed?${params}`);
  if (!res.ok) throw new Error(`피드를 불러오지 못했어요 (${res.status})`);
  const items: FeedItem[] = await res.json();
  return { cards: items.map(toFeedCard), hasMore: items.length === limit };
}
