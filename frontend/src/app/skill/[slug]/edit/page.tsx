import { EditSkillForm } from "@/components/skill-usage/EditSkillForm";

export default async function EditSkillPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <EditSkillForm skillId={slug} />
    </main>
  );
}
