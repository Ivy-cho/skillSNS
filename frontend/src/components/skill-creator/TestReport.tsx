import type { DiagnosisArea, TestReport as TestReportData } from "./types";

const GRADE_STYLE = {
  good: { pill: "bg-success/10 text-success", meter: "bg-success" },
  ok: { pill: "bg-warning/10 text-warning", meter: "bg-warning" },
  bad: { pill: "bg-error/10 text-error", meter: "bg-error" },
} as const;

function gradeKey(grade: number): keyof typeof GRADE_STYLE {
  if (grade >= 4) return "good";
  if (grade === 3) return "ok";
  return "bad";
}

function DiagnosisRow({ item }: { item: DiagnosisArea }) {
  const style = GRADE_STYLE[gradeKey(item.grade)];
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.85rem] font-semibold">{item.area}</span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[0.62rem] font-semibold ${style.pill}`}
        >
          {item.gradeLabel}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((seg) => (
          <div
            key={seg}
            className={`h-1.5 flex-1 rounded-full ${
              seg <= item.grade ? style.meter : "bg-surface-2"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{item.now}</p>
      {item.suggestion && (
        <div className="mt-2 rounded-lg bg-primary-tint px-3 py-2 text-[0.78rem] leading-relaxed text-primary-hover">
          💡 {item.suggestion}
        </div>
      )}
    </div>
  );
}

export function TestReport({ report }: { report: TestReportData }) {
  const { sampleQuestions, diagnosis, benchmark, analystNotes } = report;

  return (
    <div className="flex flex-col gap-4">
      {/* 샘플 질문 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-[0.9rem] font-bold">이런 질문으로 테스트했어요</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {sampleQuestions.map((q) => (
            <li key={q.question} className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6rem] font-semibold ${
                  q.source === "user"
                    ? "bg-info-tint text-info"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {q.source === "user" ? "내 질문" : "자동"}
              </span>
              <span className="text-[0.82rem] leading-relaxed text-ink">
                {q.question}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 진단 */}
      <section>
        <h3 className="px-1 text-[0.9rem] font-bold">항목별 진단</h3>
        <p className="mt-1 px-1 text-[0.78rem] text-muted">
          스킬의 알맹이를 8가지 기준으로 점검했어요.
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {diagnosis.map((item) => (
            <DiagnosisRow key={item.area} item={item} />
          ))}
        </div>
      </section>

      {/* 벤치마크 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-[0.9rem] font-bold">스킬이 실제로 도움이 됐나요</h3>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[0.8rem]">
            <span className="text-ink">스킬 켰을 때</span>
            <span className="font-mono font-semibold text-primary">
              {benchmark.passRate.withSkill}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${benchmark.passRate.withSkill}%` }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[0.8rem]">
            <span className="text-muted">스킬 껐을 때</span>
            <span className="font-mono font-semibold text-muted">
              {benchmark.passRate.withoutSkill}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-muted/50"
              style={{ width: `${benchmark.passRate.withoutSkill}%` }}
            />
          </div>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
            {benchmark.passRate.help}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              답변 시간
            </div>
            <div className="mt-1 text-[0.95rem] font-bold">
              평균 {benchmark.time.seconds}초
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="font-mono text-[0.68rem] uppercase tracking-wide text-muted">
              AI 생각 비용
            </div>
            <div className="mt-1 text-[0.95rem] font-bold">
              {benchmark.aiCost.level}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
          {benchmark.aiCost.help}
        </p>
      </section>

      {/* 관찰 노트 */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-[0.9rem] font-bold">눈여겨본 점</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {analystNotes.map((note) => (
            <li
              key={note}
              className="flex gap-2 text-[0.82rem] leading-relaxed text-ink"
            >
              <span className="text-muted">·</span>
              {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
