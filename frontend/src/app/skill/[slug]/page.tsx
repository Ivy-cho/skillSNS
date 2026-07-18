import { SkillUsageChat } from "@/components/skill-usage/SkillUsageChat";

export default async function SkillPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string; category?: string; emoji?: string }>;
}) {
  const { name, category, emoji } = await searchParams;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <SkillUsageChat
        skillName={name ?? "이름 없는 스킬"}
        category={category ?? "일반"}
        emoji={emoji ?? "🤖"}
      />
    </main>
  );
}
