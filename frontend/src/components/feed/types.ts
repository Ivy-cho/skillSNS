// 피드 화면 데이터 타입 + 순수 헬퍼. React 의존성 없음 (skill-creator/types.ts 컨벤션).

export type FeedAuthor = {
  name: string;
  avatar: string; // 원형 아바타에 넣을 짧은 라벨 (이름 축약 또는 이모지)
};

export type FeedCard = {
  id: string;
  categoryId: string; // skill-creator CATEGORIES의 id와 매칭 (필터용)
  title: string;
  author: FeedAuthor;
  comment: string; // 스킬 주인 "한마디"
  qa: { q: string; a: string }; // 미리보기 Q&A
  scrapCount: number;
};

export type TrendingItem = {
  id: string;
  emoji: string;
  title: string;
  author: string;
  categoryId: string;
};

// 스크랩 수 → "1.2k" 표기
export function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}
