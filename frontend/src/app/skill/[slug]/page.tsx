import { SkillUsageChat } from "@/components/skill-usage/SkillUsageChat";

export default async function SkillPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <SkillUsageChat skillId={slug} />
    </main>
  );
}
