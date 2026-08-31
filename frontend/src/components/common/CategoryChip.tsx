// 스킬의 소분류를 보여주는 칩. 카테고리는 서버(카테고리명 Agent)가 정하고
// `category`(이름) / `category_emoji`로 내려온다 — 아직 분류 전이면 "미분류 🏷️".
// 홈 목록·스크랩·피드 카드·대화 화면이 같은 모양을 쓰도록 여기 모아둔다.
export function CategoryChip({
  name,
  emoji,
  size = "md",
  showEmoji = true,
}: {
  name?: string | null;
  emoji?: string | null;
  /** sm = 카드/헤더처럼 좁은 자리 */
  size?: "sm" | "md";
  /** 이모지를 이미 옆에서 보여주고 있으면 끈다 (대화 헤더의 아바타 등) */
  showEmoji?: boolean;
}) {
  const text = size === "sm" ? "text-[0.66rem]" : "text-[0.72rem]";
  const pad = size === "sm" ? "px-1.5 py-0.5" : "h-9 px-2";
  const iconSize = size === "sm" ? "text-[0.8rem]" : "text-base";

  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-[10px] bg-surface-2 font-medium text-muted ${text} ${pad}`}
    >
      {name || "미분류"}
      {showEmoji && <span className={iconSize}>{emoji || "🏷️"}</span>}
    </span>
  );
}
