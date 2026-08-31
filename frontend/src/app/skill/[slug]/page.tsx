import { SkillUsageChat } from "@/components/skill-usage/SkillUsageChat";

export default async function SkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  // 스킬을 막 만들고 넘어왔으면(크리에이터 게시 / 내 스킬 넣기) 뒤로 가기를 채팅 목록으로 보낸다.
  const { from } = await searchParams;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <SkillUsageChat skillId={slug} justCreated={from === "create"} />
    </main>
  );
}
