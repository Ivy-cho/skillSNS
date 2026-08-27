"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { BackButton } from "@/components/nav/BackButton";
import { getSkill, updateSkill } from "@/lib/backendClient";

const TITLE_MAX = 40;

// 내가 만든 스킬 고치기 (내 스킬 목록에서 왼쪽으로 끌면 나오는 "수정").
// 이름과 프롬프트를 PATCH /skills/{id}로 보낸다. 소유자가 아니면 백엔드가 403을 준다.
// 카테고리는 백엔드가 아직 수정을 받지 않아 읽기 전용으로만 보여준다.
export function EditSkillForm({ skillId }: { skillId: string }) {
  const router = useRouter();
  // null = 아직 불러오는 중.
  const [title, setTitle] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("");
  const [categoryEmoji, setCategoryEmoji] = useState("🏷️");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSkill(skillId)
      .then((skill) => {
        if (cancelled) return;
        setTitle(skill.title);
        setPrompt(skill.md_content);
        setCategory(skill.category);
        setCategoryEmoji(skill.category_emoji);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "스킬을 불러오지 못했어요");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  const titleTooLong = (title ?? "").length > TITLE_MAX;
  const canSave = title !== null && title.trim() && prompt.trim() && !titleTooLong && !saving;

  async function handleSave() {
    if (!canSave || title === null) return;
    setError(null);
    setSaving(true);
    try {
      await updateSkill(skillId, {
        title: title.trim(),
        md_content: prompt.trim(),
        // 목록 미리보기도 같이 맞춰둔다 — 등록할 때와 같은 규칙(프롬프트 첫 줄).
        description: prompt.trim().split("\n")[0].slice(0, 100),
      });
      // 고친 내용을 바로 써볼 수 있게 그 스킬 대화 화면으로.
      router.replace(`/skill/${skillId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스킬을 수정하지 못했어요");
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
          <BackButton fallback="/home" />
          <span className="text-[0.9rem] font-bold text-ink">스킬 수정</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            aria-label="저장"
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
          {loadError ? (
            <div className="rounded-xl bg-error/10 px-4 py-3 text-[0.8rem] leading-relaxed text-error">
              ⚠️ {loadError}
            </div>
          ) : title === null ? (
            <p className="py-8 text-center text-[0.82rem] text-muted">불러오는 중…</p>
          ) : (
            <>
              <p className="text-[0.8rem] leading-relaxed text-muted">
                고친 내용은 이 스킬의 답변 기준에 바로 반영돼요. 이미 나눈 대화는 그대로
                남아요.
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
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
                />
              </div>

              {/* 카테고리 — 시스템이 스킬 내용을 보고 자동으로 정하므로 읽기 전용으로만 보여준다. */}
              <div className="mt-4">
                <span className="text-[0.8rem] font-semibold text-ink">카테고리</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem] text-muted">
                    {`${categoryEmoji} ${category}`}
                  </span>
                  <span className="text-[0.7rem] text-muted">자동으로 정해져요</span>
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
                  rows={14}
                  className="mt-1.5 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-relaxed text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
                />
              </div>

              {error && (
                <div className="mt-4 rounded-xl bg-error/10 px-4 py-3 text-[0.8rem] leading-relaxed text-error">
                  ⚠️ {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
