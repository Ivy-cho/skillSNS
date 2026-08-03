// 피드 목업 데이터 + 데이터 접근자.
// 지금은 목업을 반환한다. 백엔드(feed/skill-service)가 준비되면 getFeedCards()의 본문만
// listSkills() 실호출로 교체하면 된다 — 이 파일이 유일한 스왑 포인트다.
//
// 카테고리는 skill-creator의 실제 CATEGORIES 6개(글쓰기/인테리어/커리어/재테크/바이브 코딩/기타)
// id를 그대로 쓴다. 작성자 이름·한마디·Q&A·스크랩 수는 백엔드가 아직 주지 않는 필드라 목업이다.

import type { PublishedSkill } from "@/lib/backendClient";
import { CATEGORIES } from "../skill-creator/types";
import type { FeedCard, TrendingItem } from "./types";

export const MOCK_FEED_CARDS: FeedCard[] = [
  {
    id: "mock-interior-1",
    categoryId: "interior",
    title: "좁은 집 가구 배치법",
    author: { name: "솜테리어 윤솜", avatar: "윤솜" },
    comment: "치수 안 재고 사면 100% 후회해요 😅 동선 체크가 먼저예요.",
    qa: {
      q: "7평 원룸 침대 어디 둘까요?",
      a: "문에서 가장 먼 안쪽 벽으로요. 시야가 트여 넓어 보여요 🪟",
    },
    scrapCount: 1200,
  },
  {
    id: "mock-writing-1",
    categoryId: "writing",
    title: "클릭되는 한 줄 카피 쓰기",
    author: { name: "카피 쓰는 지우", avatar: "지우" },
    comment: "설명하려 하지 말고 궁금하게 만드세요. 정보보다 '격차'가 먼저예요.",
    qa: {
      q: "제목이 밋밋한데 어떻게 살려요?",
      a: "숫자랑 구체적 상황을 넣어보세요. '살 빼는 법'보다 '3주 만에 5kg'.",
    },
    scrapCount: 980,
  },
  {
    id: "mock-career-1",
    categoryId: "career",
    title: "붙는 자소서 첨삭법",
    author: { name: "이직코치 한결", avatar: "한결" },
    comment: "성과는 '무엇을 했다'가 아니라 '얼마나 바꿨다'로 써야 해요.",
    qa: {
      q: "경력이 부족한데 뭘 강조해요?",
      a: "직무와 연결되는 경험 딱 하나를 깊게 풀어요. 나열은 오히려 약해져요.",
    },
    scrapCount: 2100,
  },
  {
    id: "mock-finance-1",
    categoryId: "finance",
    title: "월급쟁이 첫 투자 시작하기",
    author: { name: "짠테크 미영", avatar: "미영" },
    comment: "잃지 않는 게 먼저예요. 여윳돈으로, 그리고 아는 것에만.",
    qa: {
      q: "100만원 있는데 어디부터요?",
      a: "비상금 3개월치를 먼저 만들고, 남는 돈으로 시작해요.",
    },
    scrapCount: 3100,
  },
  {
    id: "mock-vibe-1",
    categoryId: "vibe",
    title: "코딩 몰라도 앱 만들기",
    author: { name: "바이브 개발자 태오", avatar: "태오" },
    comment: "완벽한 코드 말고, 일단 돌아가는 걸 만드는 게 시작이에요.",
    qa: {
      q: "에러가 나는데 뭘 물어봐야 해요?",
      a: "에러 메시지를 그대로 붙여넣고 '왜 이래?'만 물어도 돼요.",
    },
    scrapCount: 1600,
  },
  {
    id: "mock-custom-1",
    categoryId: "custom",
    title: "뭘 해도 네 편인 고민상담",
    author: { name: "항상 내편인 친구", avatar: "💛" },
    comment: "틀려도 괜찮아. 일단 네 얘기 다 들을게 🫂 판단 없이.",
    qa: {
      q: "요즘 다 잘 안 풀려요.",
      a: "많이 지쳤겠다. 어떤 일부터 얘기해볼까?",
    },
    scrapCount: 2400,
  },
];

export const MOCK_TRENDING: TrendingItem[] = [
  { id: "t1", emoji: "🛋️", title: "좁은 집 배치", author: "윤솜", categoryId: "interior" },
  { id: "t2", emoji: "✍️", title: "한 줄 카피", author: "지우", categoryId: "writing" },
  { id: "t3", emoji: "💰", title: "첫 투자", author: "미영", categoryId: "finance" },
  { id: "t4", emoji: "💼", title: "자소서 첨삭", author: "한결", categoryId: "career" },
];

// 백엔드 스킬(PublishedSkill) → 피드 카드 매퍼 (실데이터 스왑용, 지금은 미사용).
// 백엔드에 없는 필드(작성자 이름/한마디/Q&A/스크랩)는 임시값으로 채운다.
// 네트워크 경계라 타입이 보장되지 않으므로 누락 필드도 방어적으로 처리한다.
export function toFeedCard(skill: PublishedSkill): FeedCard {
  // 백엔드 category는 한글 라벨("인테리어")이라 필터용 id("interior")로 변환한다.
  // CATEGORIES(6개, "기타"=custom 포함)에서 라벨로 찾고, 없으면 원본 라벨을 그대로 둔다.
  const matched = CATEGORIES.find((c) => c.label === skill.category);
  const userId = skill.user_id ?? "";
  return {
    id: skill.id,
    categoryId: matched?.id ?? skill.category,
    title: skill.title,
    author: { name: userId || "익명", avatar: (userId || "??").slice(0, 2) },
    comment: skill.description ?? "",
    qa: { q: "", a: "" },
    scrapCount: 0,
  };
}

// 피드 카드 목록. 지금은 목업을 반환한다.
// 백엔드가 준비되면 아래 한 줄로 교체:
//   const skills = await listSkills();
//   return skills.map(toFeedCard);
export async function getFeedCards(): Promise<FeedCard[]> {
  return MOCK_FEED_CARDS;
}
