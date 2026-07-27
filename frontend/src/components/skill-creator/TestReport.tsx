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
  const grade = item.grade ?? 0;
  const style = GRADE_STYLE[gradeKey(grade)];
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.85rem] font-semibold">{item.area}</span>
        {item.gradeLabel && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[0.62rem] font-semibold ${style.pill}`}
          >
            {item.gradeLabel}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((seg) => (
          <div
            key={seg}
            className={`h-1.5 flex-1 rounded-full ${
              seg <= grade ? style.meter : "bg-surface-2"
            }`}
          />
        ))}
      </div>
      {item.now && (
        <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{item.now}</p>
      )}
      {item.suggestion && (
        <div className="mt-2 rounded-lg bg-primary-tint px-3 py-2 text-[0.78rem] leading-relaxed text-primary-hover">
          💡 {item.suggestion}
        </div>
      )}
    </div>
  );
}

// 리포트는 LLM이 생성해서 가끔 일부 필드가 비거나 빠질 수 있다. 어떤 경우에도 앱이 죽지
// 않도록, 각 섹션/필드는 값이 있을 때만 렌더한다. (Partial로 다뤄 런타임 누락을 흡수)
type PartialReport = {
  sampleQuestions?: TestReportData["sampleQuestions"];
  diagnosis?: TestReportData["diagnosis"];
  benchmark?: {
    passRate?: Partial<TestReportData["benchmark"]["passRate"]>;
    time?: Partial<TestReportData["benchmark"]["time"]>;
    aiCost?: Partial<TestReportData["benchmark"]["aiCost"]>;
  };
  analystNotes?: TestReportData["analystNotes"];
};

export function TestReport({ report }: { report: TestReportData }) {
  const { sampleQuestions, diagnosis, benchmark, analystNotes } =
    (report ?? {}) as PartialReport;
  const passRate = benchmark?.passRate;
  const time = benchmark?.time;
  const aiCost = benchmark?.aiCost;
  const hasBenchmark = Boolean(passRate || time || aiCost);

  return (
    <div className="flex flex-col gap-4">
      {/* 샘플 질문 */}
      {sampleQuestions && sampleQuestions.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-[0.9rem] font-bold">이런 질문으로 테스트했어요</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {sampleQuestions.map((q, i) => (
              <li key={`${q.question}-${i}`} className="flex items-start gap-2">
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
      )}

      {/* 진단 */}
      {diagnosis && diagnosis.length > 0 && (
        <section>
          <h3 className="px-1 text-[0.9rem] font-bold">항목별 진단</h3>
          <p className="mt-1 px-1 text-[0.78rem] text-muted">
            스킬의 알맹이를 8가지 기준으로 점검했어요.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {diagnosis.map((item, i) => (
              <DiagnosisRow key={`${item.area}-${i}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 벤치마크 */}
      {hasBenchmark && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-[0.9rem] font-bold">스킬이 실제로 도움이 됐나요</h3>

          {passRate && (
            <div className="mt-3">
              {typeof passRate.withSkill === "number" && (
                <>
                  <div className="flex items-center justify-between text-[0.8rem]">
                    <span className="text-ink">스킬 켰을 때</span>
                    <span className="font-mono font-semibold text-primary">
                      {passRate.withSkill}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${passRate.withSkill}%` }}
                    />
                  </div>
                </>
              )}

              {typeof passRate.withoutSkill === "number" && (
                <>
                  <div className="mt-2.5 flex items-center justify-between text-[0.8rem]">
                    <span className="text-muted">스킬 껐을 때</span>
                    <span className="font-mono font-semibold text-muted">
                      {passRate.withoutSkill}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-muted/50"
                      style={{ width: `${passRate.withoutSkill}%` }}
                    />
                  </div>
                </>
              )}
              {passRate.help && (
                <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
                  {passRate.help}
                </p>
              )}
            </div>
          )}

          {(time?.seconds != null || aiCost?.level) && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {time?.seconds != null && (
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="font-mono text-[0.68rem] uppercase tracking-wide text-muted">
                    답변 시간
                  </div>
                  <div className="mt-1 text-[0.95rem] font-bold">
                    평균 {time.seconds}초
                  </div>
                </div>
              )}
              {aiCost?.level && (
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="font-mono text-[0.68rem] uppercase tracking-wide text-muted">
                    AI 생각 비용
                  </div>
                  <div className="mt-1 text-[0.95rem] font-bold">{aiCost.level}</div>
                </div>
              )}
            </div>
          )}
          {aiCost?.help && (
            <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
              {aiCost.help}
            </p>
          )}
        </section>
      )}

      {/* 관찰 노트 */}
      {analystNotes && analystNotes.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-[0.9rem] font-bold">눈여겨본 점</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {analystNotes.map((note, i) => (
              <li
                key={`${note}-${i}`}
                className="flex gap-2 text-[0.82rem] leading-relaxed text-ink"
              >
                <span className="text-muted">·</span>
                {note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
