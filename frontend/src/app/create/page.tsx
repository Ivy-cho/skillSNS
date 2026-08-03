import { SkillCreator } from "@/components/skill-creator/SkillCreator";
import { AuthGate } from "@/components/auth/AuthGate";

// 스킬 만들기 — 내 홈에서 진입한다.
export default function CreatePage() {
  return (
    <AuthGate>
      <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
        <SkillCreator />
      </main>
    </AuthGate>
  );
}
