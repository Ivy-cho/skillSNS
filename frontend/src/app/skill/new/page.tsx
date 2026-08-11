"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { BackButton } from "@/components/nav/BackButton";
import { createSkillDirect } from "@/lib/backendClient";
import { CATEGORIES } from "@/components/skill-creator/types";

const TITLE_MAX = 40;

// "내 스킬 넣기" — 이미 쓰고 있는 프롬프트를 그대로 스킬로 등록한다.
// 입력한 프롬프트가 md_content로 저장되고, 그게 곧 이 스킬의 시스템 프롬프트가 된다.
export default function NewSkillPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].label);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleTooLong = title.length > TITLE_MAX;
  const canSave = title.trim() && prompt.trim() && !titleTooLong && !saving;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const skill = await createSkillDirect({
        title: title.trim(),
        category,
        md_content: prompt.trim(),
        // 목록에서 한눈에 보이도록 프롬프트 첫 줄을 설명으로 쓴다.
        description: prompt.trim().split("\n")[0].slice(0, 100),
      });
      // 등록 직후 바로 써볼 수 있게 그 스킬 대화 화면으로 보낸다.
      router.replace(`/skill/${skill.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스킬을 등록하지 못했어요");
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
          <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
            <BackButton fallback="/home" />
            <span className="text-[0.9rem] font-bold text-ink">내 스킬 넣기</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              aria-label="등록"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-primary transition hover:bg-surface-2 active:scale-95 disabled:opacity-40 motion-reduce:transition-none"
            >
              {saving ? (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-primary"
                  style={{ animation: "dot-ring 1.2s ease-out infinite" }}
                />
              ) : (
                "✓"
              )}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-5">
            <p className="text-[0.8rem] leading-relaxed text-muted">
              이미 쓰고 있는 프롬프트가 있다면 그대로 넣어주세요. 넣은 내용이 이 스킬의
              답변 기준이 돼요.
            </p>

            {/* 이름 */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="title" className="text-[0.8rem] font-semibold text-ink">
                  스킬 이름
                </label>
                <span
                  className={`font-mono text-[0.68rem] ${titleTooLong ? "text-error" : "text-muted"}`}
                >
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 면접 답변 다듬어주는 코치"
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
              />
            </div>

            {/* 카테고리 */}
            <div className="mt-4">
              <span className="text-[0.8rem] font-semibold text-ink">카테고리</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.label)}
                    className={`rounded-full border px-3 py-1.5 text-[0.8rem] transition active:scale-95 motion-reduce:transition-none ${
                      category === c.label
                        ? "border-primary bg-primary-tint font-semibold text-primary-hover"
                        : "border-border bg-surface text-ink"
                    }`}
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 프롬프트 */}
            <div className="mt-4">
              <label htmlFor="prompt" className="text-[0.8rem] font-semibold text-ink">
                프롬프트 내용
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={10}
                placeholder={
                  "이 스킬이 어떻게 답해야 하는지 적어주세요.\n\n예)\n너는 면접 코치야.\n답변을 STAR 구조(상황-과제-행동-결과)로 다듬어 줘.\n모르는 건 솔직히 인정하도록 안내해."
                }
                className="mt-1.5 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-relaxed text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
              />
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-error/10 px-4 py-3 text-[0.8rem] leading-relaxed text-error">
                ⚠️ {error}
              </div>
            )}
          </div>
        </div>
      </main>
    </AuthGate>
  );
}
