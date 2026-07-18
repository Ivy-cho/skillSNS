import { SkillCreator } from "@/components/skill-creator/SkillCreator";

export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <SkillCreator />
    </main>
  );
}
