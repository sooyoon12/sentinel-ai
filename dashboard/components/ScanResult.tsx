"use client";

import type { StageEvent } from "@/lib/types";

interface Props {
  finalEvent: StageEvent | null;
  error: string | null;
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    healed: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/40",
    clean: "bg-sky-500/10 text-sky-300 ring-sky-500/40",
    error: "bg-red-500/10 text-red-300 ring-red-500/40",
  };
  const cls = map[status ?? ""] ?? "bg-zinc-700/30 text-zinc-300 ring-zinc-600";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest ring-1 ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status ?? "unknown"}
    </span>
  );
}

export function ScanResult({ finalEvent, error }: Props) {
  if (error) {
    return (
      <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-5">
        <h2 className="mb-2 text-sm uppercase tracking-[0.2em] text-red-300">
          ▸ Error
        </h2>
        <pre className="whitespace-pre-wrap break-words text-xs text-red-200">
          {error}
        </pre>
      </div>
    );
  }

  if (!finalEvent) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-2 text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ Result
        </h2>
        <p className="text-xs text-zinc-500">
          Scan 결과가 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  const vulns = finalEvent.vulnerabilities ?? [];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ Result
        </h2>
        <StatusBadge status={finalEvent.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Target</dt>
          <dd
            className="truncate text-emerald-300"
            title={finalEvent.target}
          >
            {finalEvent.target}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Category</dt>
          <dd className="text-zinc-200">{finalEvent.category}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Attempts</dt>
          <dd className="text-zinc-200">{finalEvent.total_attempts ?? 0}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Vulns Found</dt>
          <dd className="text-zinc-200">{finalEvent.vuln_count ?? 0}</dd>
        </div>
      </dl>

      {vulns.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
            Findings
          </h3>
          <div className="space-y-2">
            {vulns.map((v, i) => (
              <div
                key={i}
                className="rounded border border-red-800/40 bg-red-950/20 px-3 py-2 text-[11.5px]"
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-red-300">
                    {(v.anomaly_type as string) ?? "anomaly"}
                  </span>
                  <span>HTTP {v.status_code ?? "?"} · {v.response_time_ms ?? "?"}ms</span>
                </div>
                <div className="mt-1 break-all text-zinc-200">
                  <span className="text-zinc-500">payload </span>
                  <code>{(v.payload as string) ?? "—"}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {finalEvent.patch_log && (
        <details className="mt-5 rounded border border-zinc-800 bg-black/40 p-3 text-xs">
          <summary className="cursor-pointer text-zinc-400">
            patch_log ({finalEvent.patch_log.split("\n").length} lines)
          </summary>
          <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-zinc-300">
            {finalEvent.patch_log}
          </pre>
        </details>
      )}
    </div>
  );
}
