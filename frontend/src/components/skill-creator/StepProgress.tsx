const TOTAL_STEPS = 7; // 1..6 + finish
const FINISH_STEP = TOTAL_STEPS;

// currentStep = 실제로 도달한 최신 단계(live). viewStep = 지금 화면에 보고 있는 단계.
// 지난 단계를 돌아보는 중이면 viewStep < currentStep 이 되고, 그 노드를 active로 강조한다.
export function StepProgress({
  currentStep,
  viewStep,
}: {
  currentStep: number;
  viewStep?: number;
}) {
  const view = viewStep ?? currentStep;

  return (
    <div className="flex items-center px-5 pb-5 pt-2.5">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(
        (step, idx) => {
          const isFinish = step === FINISH_STEP;
          const state = isFinish
            ? currentStep >= FINISH_STEP
              ? "done"
              : "upcoming"
            : step === view
            ? "active"
            : step <= currentStep
            ? "done"
            : "upcoming";

          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <div key={`${step}-${state}`} className="relative">
                {state === "active" && (
                  <span
                    className="absolute -inset-1 rounded-full border-[1.5px] border-primary opacity-50"
                    style={{ animation: "dot-ring 1.3s ease-out infinite" }}
                  />
                )}
                {isFinish ? (
                  <div
                    className={`flex h-[17px] items-center justify-center rounded-full px-2 font-mono text-[0.5rem] uppercase tracking-wide transition-colors ${
                      state === "done"
                        ? "bg-primary text-on-primary"
                        : "border border-border bg-surface-2 text-muted"
                    }`}
                  >
                    {state === "done" ? (
                      <span
                        style={{
                          animation:
                            "dot-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        }}
                      >
                        ✓ finish
                      </span>
                    ) : (
                      "finish"
                    )}
                  </div>
                ) : (
                  <div
                    className={`flex h-[17px] w-[17px] items-center justify-center rounded-full font-mono text-[0.58rem] transition-colors ${
                      state === "done"
                        ? "bg-primary text-on-primary"
                        : state === "active"
                        ? "border-[1.5px] border-primary bg-primary-tint text-primary-hover"
                        : "border border-border bg-surface-2 text-muted"
                    }`}
                  >
                    {state === "done" ? (
                      <span
                        style={{
                          animation:
                            "dot-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        }}
                      >
                        ✓
                      </span>
                    ) : (
                      step
                    )}
                  </div>
                )}
              </div>

              {idx < TOTAL_STEPS - 1 && (
                <div className="relative mx-0.5 h-[2px] flex-1 bg-border">
                  <div
                    className="absolute inset-0 bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: step < currentStep ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          );
        }
      )}
    </div>
  );
}
