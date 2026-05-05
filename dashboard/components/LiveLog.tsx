"use client";

import { useEffect, useRef } from "react";

import type { LogEvent } from "@/lib/types";

interface Props {
  logs: LogEvent[];
  isRunning: boolean;
}

function colorize(line: string): string {
  if (line.includes("[1/3]")) return "text-sky-400";
  if (line.includes("[2/3]")) return "text-amber-300";
  if (line.includes("[3/3]")) return "text-fuchsia-300";
  if (line.includes("패치 적용 완료") || line.includes("자가 치유 완료"))
    return "text-emerald-300";
  if (line.includes("취약점:") || line.includes("severity"))
    return "text-red-300";
  if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@"))
    return "text-zinc-500";
  if (line.startsWith("+")) return "text-emerald-400";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-400";
  return "text-zinc-300";
}

export function LiveLog({ logs, isRunning }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">
          ▸ Live Stream
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span>{logs.length} lines</span>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" />
              streaming
            </span>
          )}
        </div>
      </div>
      <div
        ref={ref}
        className="scanlines max-h-[420px] min-h-[260px] overflow-y-auto bg-black/60 px-4 py-3 text-[12.5px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600">
            <span className="text-emerald-500">$</span>{" "}
            {isRunning ? "waiting for first event..." : "idle. run a scan to begin."}
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${colorize(log.line)}`}
            >
              <span className="mr-2 select-none text-zinc-700">
                {String(i + 1).padStart(3, "0")}
              </span>
              {log.line || " "}
            </div>
          ))
        )}
        {isRunning && (
          <div className="text-emerald-400">
            <span className="animate-pulse-dot">▋</span>
          </div>
        )}
      </div>
    </div>
  );
}
