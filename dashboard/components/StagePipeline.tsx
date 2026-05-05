"use client";

import type { StageEvent, StageName } from "@/lib/types";

const PIPELINE: { key: StageName; label: string; description: string }[] = [
  { key: "fuzz_start", label: "Fuzz", description: "Sending malicious payloads" },
  { key: "fuzz_done", label: "Detect", description: "Anomaly classification" },
  { key: "analyze", label: "Analyze", description: "LLM error analysis" },
  { key: "patch", label: "Patch", description: "Code generation" },
  { key: "validate", label: "Validate", description: "AST / build check" },
  { key: "apply", label: "Apply", description: "Write to source" },
];

interface Props {
  stages: StageEvent[];
  isRunning: boolean;
}

export function StagePipeline({ stages, isRunning }: Props) {
  const reached = new Set(stages.map((s) => s.stage));
  const currentIdx = (() => {
    for (let i = PIPELINE.length - 1; i >= 0; i--) {
      if (reached.has(PIPELINE[i].key)) return i;
    }
    return -1;
  })();

  const isClean = stages.some(
    (s) => s.stage === "complete" && s.status === "clean",
  );
  const isError = stages.some(
    (s) => s.stage === "error" || (s.stage === "complete" && s.status === "error"),
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ Pipeline
        </h2>
        {isRunning && (
          <span className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-emerald-400" />
            LIVE
          </span>
        )}
      </div>

      <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {PIPELINE.map((step, i) => {
          const done = currentIdx > i || (currentIdx === i && !isRunning);
          const active = currentIdx === i && isRunning;
          const skipped = isClean && i >= 2;
          const failed = isError && i === currentIdx;

          let tone = "border-zinc-700 bg-zinc-950 text-zinc-500";
          if (done && !failed) tone = "border-emerald-700/50 bg-emerald-950/40 text-emerald-300";
          if (active) tone = "border-emerald-500 bg-emerald-500/10 text-emerald-200";
          if (skipped) tone = "border-zinc-800 bg-zinc-900/40 text-zinc-600";
          if (failed) tone = "border-red-700/60 bg-red-950/40 text-red-300";

          return (
            <li
              key={step.key}
              className={`relative rounded border px-3 py-2 transition-colors ${tone}`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest opacity-70">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  {failed
                    ? "FAIL"
                    : skipped
                      ? "SKIP"
                      : done
                        ? "OK"
                        : active
                          ? "RUN"
                          : "—"}
                </span>
              </div>
              <div className="mt-0.5 text-sm font-semibold">{step.label}</div>
              <div className="text-[11px] opacity-70">{step.description}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
