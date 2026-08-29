// 피드 데이터 접근자. feed-service(GET /feed)를 호출한다. 트렌딩 칩은 별도 API 없이
// 불러온 카드에서 클라이언트가 직접 정렬해 뽑는다(toTrending) — 조회수 내림차순,
// 조회수가 같으면 스킬 이름 오름차순(가나다순).
//
// 카테고리 이름·이모지는 feed-service가 categories 테이블을 조인해 내려준다(item.category /
// item.category_emoji). 프론트에서 라벨↔id 변환을 하지 않는다. Q&A(대표 질답 미리보기)는
// 저장되는 데이터가 아니라 아직 없다 — FeedCard가 빈 값이면 알아서 숨긴다.

import type { FeedCard, TrendingItem } from "./types";

const FEED_SERVICE_URL = process.env.NEXT_PUBLIC_FEED_SERVICE_URL ?? "";

// feed-service GET /feed 응답 1건 (계약: feed-service/app/schemas/feed.py FeedItem).
type FeedItem = {
  id: string;
  title: string;
  description: string | null;
  category: string; // 소분류 이름
  category_emoji: string; // 소분류 이모지
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
  const nickname = item.author_nickname || "익명";
  return {
    id: item.id,
    // categoryId는 필터용 식별자 — 이제 카테고리 이름을 그대로 쓴다(별도 프리셋 id 없음).
    // 이름은 화면에도 노출되므로 emoji와 똑같이 누락 시 '미분류'로 방어한다(빈 라벨 방지).
    categoryId: item.category || "미분류",
    emoji: item.category_emoji ?? "🏷️",
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
