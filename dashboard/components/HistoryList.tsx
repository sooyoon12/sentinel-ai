"use client";

import type { ScanRecord } from "@/lib/types";

interface Props {
  records: ScanRecord[];
  onRetry: (record: ScanRecord) => void;
  onSelect: (record: ScanRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return iso;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const STATUS_BADGE: Record<string, string> = {
  healed: "text-emerald-400",
  clean: "text-sky-400",
  error: "text-red-400",
  running: "text-amber-300",
};

export function HistoryList({
  records,
  onRetry,
  onSelect,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ History
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span>{records.length} entries</span>
          {records.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-zinc-500 hover:text-red-400"
            >
              clear all
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-zinc-600">
          저장된 스캔 기록이 없습니다.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-zinc-800/70 overflow-y-auto">
          {records.map((r) => (
            <li
              key={r.id}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-900/80"
            >
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`font-semibold uppercase tracking-widest ${STATUS_BADGE[r.status] ?? "text-zinc-400"}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">{r.params.category}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">
                    {r.vulnCount} vuln / {r.totalAttempts} attempts
                  </span>
                </div>
                <div
                  className="mt-1 truncate text-xs text-emerald-300"
                  title={r.params.target}
                >
                  {r.params.target}
                </div>
                <div className="text-[10px] text-zinc-600">
                  {timeAgo(r.startedAt)}
                </div>
              </button>
              <div className="flex shrink-0 flex-col gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onRetry(r)}
                  className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/20"
                >
                  ↻ retry
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/20"
                >
                  ✕ del
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
