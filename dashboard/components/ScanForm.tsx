"use client";

import { useEffect, useState } from "react";

import type { ScanCategory, ScanParams } from "@/lib/types";

const CATEGORIES: { value: ScanCategory; label: string }[] = [
  { value: "sql_injection", label: "SQL Injection" },
  { value: "overflow", label: "Buffer Overflow" },
  { value: "format_string", label: "Format String" },
  { value: "all", label: "All Categories" },
];

const DEFAULT_TARGET = "http://host.docker.internal:8080/api/user";

interface Props {
  initial?: Partial<ScanParams>;
  disabled?: boolean;
  onSubmit: (params: ScanParams) => void;
  onAbort?: () => void;
  isRunning?: boolean;
}

export function ScanForm({
  initial,
  disabled,
  onSubmit,
  onAbort,
  isRunning,
}: Props) {
  const [target, setTarget] = useState(initial?.target ?? DEFAULT_TARGET);
  const [category, setCategory] = useState<ScanCategory>(
    initial?.category ?? "sql_injection",
  );
  const [concurrency, setConcurrency] = useState<number>(
    initial?.concurrency ?? 5,
  );

  useEffect(() => {
    if (initial?.target) setTarget(initial.target);
    if (initial?.category) setCategory(initial.category);
    if (typeof initial?.concurrency === "number")
      setConcurrency(initial.concurrency);
  }, [initial?.target, initial?.category, initial?.concurrency]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ target, category, concurrency });
      }}
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ Initiate Scan
        </h2>
        <span className="text-[10px] text-zinc-500">POST /scan-stream</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_180px_120px]">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Target URL</span>
          <input
            type="text"
            required
            disabled={disabled}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={DEFAULT_TARGET}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-emerald-300 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Category</span>
          <select
            disabled={disabled}
            value={category}
            onChange={(e) => setCategory(e.target.value as ScanCategory)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Concurrency</span>
          <input
            type="number"
            min={1}
            max={50}
            disabled={disabled}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {isRunning ? (
          <button
            type="button"
            onClick={onAbort}
            className="rounded bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/20"
          >
            ■ Abort
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled}
            className="rounded bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ▶ Run Scan
          </button>
        )}
        <span className="text-xs text-zinc-500">
          Streams analyze → patch → validate → apply
        </span>
      </div>
    </form>
  );
}
