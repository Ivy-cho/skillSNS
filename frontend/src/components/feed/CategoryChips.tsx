import { CATEGORIES } from "../skill-creator/types";

// 카테고리 필터 칩. 선택 상태는 부모(SkillFeed)가 들고, 여기선 표시 + 클릭만 한다.
// 선택된 칩을 다시 누르면 해제(null)된다.
export function CategoryChips({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((category) => {
        const on = selected === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(on ? null : category.id)}
            className={`flex shrink-0 items-center gap-1 rounded-full border-[1.5px] px-3 py-1.5 text-[0.72rem] font-medium transition ${
              on
                ? "border-primary bg-primary text-on-primary"
                : "border-border bg-surface text-ink"
            }`}
          >
            <span>{category.emoji}</span>
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
