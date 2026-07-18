"use client";

import { useState } from "react";
import { CATEGORIES, type Category } from "./types";
import { CustomCategoryModal } from "./CustomCategoryModal";

export function CategoryGrid({
  onSelect,
}: {
  onSelect: (category: Category) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() =>
              category.id === "custom"
                ? setCustomOpen(true)
                : onSelect(category)
            }
            className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-outline-strong bg-surface px-2 py-3.5 text-[0.82rem] text-ink transition hover:-translate-y-0.5 hover:border-primary hover:text-primary-hover"
          >
            <span className="text-2xl">{category.emoji}</span>
            {category.label}
          </button>
        ))}
      </div>

      <CustomCategoryModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onCreate={(category) => {
          setCustomOpen(false);
          onSelect(category);
        }}
      />
    </>
  );
}
