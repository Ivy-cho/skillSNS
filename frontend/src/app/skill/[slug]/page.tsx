import { SkillUsageChat } from "@/components/skill-usage/SkillUsageChat";

export default async function SkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; new?: string; session?: string }>;
}) {
  const { slug } = await params;
  // from=create: 스킬을 막 만들고 넘어왔다 — 뒤로 가기를 채팅 목록으로 보낸다.
  // new=1: 피드·내 스킬·스크랩에서 둘러보다 들어왔다 — 지난 대화를 잇지 않고 새로 시작한다.
  // session: 채팅 목록에서 고른 '그 대화'를 연다.
  const { from, new: startNew, session } = await searchParams;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <SkillUsageChat
        skillId={slug}
        justCreated={from === "create"}
        startNew={startNew === "1"}
        sessionId={session}
      />
    </main>
  );
}
