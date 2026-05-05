"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HistoryList } from "@/components/HistoryList";
import { LiveLog } from "@/components/LiveLog";
import { ScanForm } from "@/components/ScanForm";
import { ScanResult } from "@/components/ScanResult";
import { StagePipeline } from "@/components/StagePipeline";
import { useScanStream } from "@/hooks/useScanStream";
import {
  clearHistory,
  deleteRecord,
  loadHistory,
  newId,
  saveRecord,
} from "@/lib/history";
import type { ScanParams, ScanRecord, StageEvent } from "@/lib/types";

const HEALER_URL =
  process.env.NEXT_PUBLIC_HEALER_URL || "http://localhost:8001";

export default function Home() {
  const stream = useScanStream();
  const [healerUp, setHealerUp] = useState<boolean | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<Partial<ScanParams>>();
  const [viewing, setViewing] = useState<ScanRecord | null>(null);

  const recordRef = useRef<ScanRecord | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${HEALER_URL}/health`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setHealerUp(Boolean(d?.ok));
      })
      .catch(() => {
        if (!cancelled) setHealerUp(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isRunning =
    stream.state === "connecting" || stream.state === "streaming";

  const startScan = useCallback(
    (params: ScanParams) => {
      const id = newId();
      const startedAt = new Date().toISOString();
      const initialRecord: ScanRecord = {
        id,
        startedAt,
        params,
        status: "running",
        vulnCount: 0,
        totalAttempts: 0,
        vulnerabilities: [],
        logs: [],
      };
      recordRef.current = initialRecord;
      setActiveRecordId(id);
      setViewing(null);
      saveRecord(initialRecord);
      setHistory(loadHistory());

      stream.start(params, {
        onLog: (line) => {
          if (!recordRef.current) return;
          recordRef.current = {
            ...recordRef.current,
            logs: [...recordRef.current.logs, line],
          };
        },
        onStage: (ev: StageEvent) => {
          if (!recordRef.current) return;
          if (ev.stage === "fuzz_done") {
            recordRef.current = {
              ...recordRef.current,
              vulnCount: ev.vuln_count ?? 0,
              totalAttempts: ev.total_attempts ?? 0,
              vulnerabilities: ev.vulnerabilities ?? [],
            };
          }
        },
        onComplete: (final) => {
          if (!recordRef.current) return;
          const finished: ScanRecord = {
            ...recordRef.current,
            endedAt: new Date().toISOString(),
            status:
              final.status === "healed"
                ? "healed"
                : final.status === "clean"
                  ? "clean"
                  : "error",
            vulnCount: final.vuln_count ?? recordRef.current.vulnCount,
            totalAttempts:
              final.total_attempts ?? recordRef.current.totalAttempts,
            vulnerabilities:
              final.vulnerabilities ?? recordRef.current.vulnerabilities,
            patchLog: final.patch_log,
          };
          saveRecord(finished);
          setHistory(loadHistory());
          recordRef.current = finished;
        },
      });
    },
    [stream],
  );

  const onRetry = useCallback(
    (record: ScanRecord) => {
      setFormInitial(record.params);
      setViewing(null);
      setTimeout(() => startScan(record.params), 0);
    },
    [startScan],
  );

  const onSelect = useCallback((record: ScanRecord) => {
    setViewing(record);
  }, []);

  const onDelete = useCallback(
    (id: string) => {
      deleteRecord(id);
      setHistory(loadHistory());
      if (activeRecordId === id) setActiveRecordId(null);
      if (viewing?.id === id) setViewing(null);
    },
    [activeRecordId, viewing],
  );

  const onClear = useCallback(() => {
    if (!confirm("저장된 스캔 기록을 모두 삭제하시겠습니까?")) return;
    clearHistory();
    setHistory([]);
    setActiveRecordId(null);
    setViewing(null);
  }, []);

  const displayedFinal: StageEvent | null = useMemo(() => {
    if (viewing) {
      return {
        stage: "complete",
        ts: viewing.endedAt ?? viewing.startedAt,
        status:
          viewing.status === "running"
            ? "error"
            : (viewing.status as "healed" | "clean" | "error"),
        target: viewing.params.target,
        category: viewing.params.category,
        vulnerabilities: viewing.vulnerabilities,
        vuln_count: viewing.vulnCount,
        total_attempts: viewing.totalAttempts,
        patch_log: viewing.patchLog,
      };
    }
    return stream.finalEvent;
  }, [viewing, stream.finalEvent]);

  const displayedLogs = useMemo(() => {
    if (viewing) {
      return viewing.logs.map((line, i) => ({
        line,
        ts: viewing.startedAt,
        _key: i,
      }));
    }
    return stream.logs;
  }, [viewing, stream.logs]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            <span className="text-emerald-400">▣</span> Sentinel-AI
            <span className="ml-3 text-xs font-normal uppercase tracking-[0.3em] text-zinc-500">
              Self-healing Security Console
            </span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Agentic MCP fuzzer + LangGraph healer · live stream via SSE
          </p>
        </div>
        <div className="text-right text-[11px]">
          <div className="text-zinc-500">healer</div>
          <div
            className={
              healerUp === null
                ? "text-zinc-400"
                : healerUp
                  ? "text-emerald-400"
                  : "text-red-400"
            }
          >
            {healerUp === null ? "checking..." : healerUp ? "● online" : "● offline"}
          </div>
        </div>
      </header>

      <div className="mb-6">
        <ScanForm
          initial={formInitial}
          disabled={isRunning}
          isRunning={isRunning}
          onSubmit={startScan}
          onAbort={stream.stop}
        />
      </div>

      <div className="mb-6">
        <StagePipeline stages={stream.stages} isRunning={isRunning} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <LiveLog logs={displayedLogs} isRunning={isRunning && !viewing} />
          <ScanResult finalEvent={displayedFinal} error={stream.error} />
        </div>
        <aside className="space-y-6">
          <HistoryList
            records={history}
            onRetry={onRetry}
            onSelect={onSelect}
            onDelete={onDelete}
            onClear={onClear}
          />
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-[11px] text-zinc-500">
            <div className="mb-1 uppercase tracking-[0.2em] text-zinc-400">
              ▸ Endpoint
            </div>
            <code className="break-all text-emerald-300">{HEALER_URL}</code>
            <div className="mt-2 text-zinc-600">
              NEXT_PUBLIC_HEALER_URL 환경변수로 변경 가능
            </div>
          </div>
        </aside>
      </div>

      {viewing && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-300 shadow-lg hover:bg-zinc-800"
          >
            ← 라이브 뷰로 돌아가기
          </button>
        </div>
      )}

      <footer className="mt-12 border-t border-zinc-800 pt-5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        Sentinel-AI · Week 4 Dashboard
      </footer>
    </main>
  );
}
