const TOTAL_STEPS = 6;

export function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center px-5 pb-5 pt-2.5">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(
        (step, idx) => {
          const state =
            step < currentStep
              ? "done"
              : step === currentStep
              ? "active"
              : "upcoming";
          const isLast = step === TOTAL_STEPS;

          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <div key={`${step}-${state}`} className="relative">
                {state === "active" && (
                  <span
                    className="absolute -inset-1 rounded-full border-[1.5px] border-primary opacity-50"
                    style={{ animation: "dot-ring 1.3s ease-out infinite" }}
                  />
                )}
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
                {isLast && (
                  <span className="absolute left-1/2 top-[21px] -translate-x-1/2 whitespace-nowrap font-mono text-[0.5rem] tracking-wide text-primary-hover">
                    완료
                  </span>
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
