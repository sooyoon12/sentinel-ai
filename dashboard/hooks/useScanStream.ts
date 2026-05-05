"use client";

import { useCallback, useRef, useState } from "react";

import type {
  ConnectionState,
  LogEvent,
  ScanParams,
  StageEvent,
} from "@/lib/types";

const HEALER_URL =
  process.env.NEXT_PUBLIC_HEALER_URL || "http://localhost:8001";

export interface ScanStreamState {
  state: ConnectionState;
  logs: LogEvent[];
  stages: StageEvent[];
  finalEvent: StageEvent | null;
  error: string | null;
}

const initial: ScanStreamState = {
  state: "idle",
  logs: [],
  stages: [],
  finalEvent: null,
  error: null,
};

function* parseSseFrames(buffer: string): Generator<[string, unknown]> {
  const frames = buffer.split("\n\n");
  for (const frame of frames) {
    if (!frame.trim()) continue;
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) continue;
    try {
      yield [eventName, JSON.parse(dataLines.join("\n"))];
    } catch {
      // ignore malformed frame
    }
  }
}

export function useScanStream() {
  const [stream, setStream] = useState<ScanStreamState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(
    async (
      params: ScanParams,
      callbacks?: {
        onLog?: (line: string) => void;
        onStage?: (stage: StageEvent) => void;
        onComplete?: (final: StageEvent) => void;
      },
    ) => {
      stop();
      setStream({ ...initial, state: "connecting" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${HEALER_URL}/scan-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || "no body"}`);
        }

        setStream((s) => ({ ...s, state: "streaming" }));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lastBlank = buf.lastIndexOf("\n\n");
          if (lastBlank === -1) continue;
          const ready = buf.slice(0, lastBlank + 2);
          buf = buf.slice(lastBlank + 2);

          for (const [name, data] of parseSseFrames(ready)) {
            if (name === "log") {
              const ev = data as LogEvent;
              callbacks?.onLog?.(ev.line);
              setStream((s) => ({ ...s, logs: [...s.logs, ev] }));
            } else if (name === "stage") {
              const ev = data as StageEvent;
              callbacks?.onStage?.(ev);
              setStream((s) => ({
                ...s,
                stages: [...s.stages, ev],
                ...(ev.stage === "complete"
                  ? { state: "complete" as const, finalEvent: ev }
                  : {}),
                ...(ev.stage === "error"
                  ? { error: String(ev.error ?? "unknown") }
                  : {}),
              }));
              if (ev.stage === "complete") callbacks?.onComplete?.(ev);
            }
          }
        }

        setStream((s) =>
          s.state === "complete" ? s : { ...s, state: "complete" },
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setStream((s) => ({ ...s, state: "idle" }));
        } else {
          setStream((s) => ({
            ...s,
            state: "error",
            error: (e as Error).message,
          }));
        }
      } finally {
        abortRef.current = null;
      }
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    setStream(initial);
  }, [stop]);

  return { ...stream, start, stop, reset };
}
