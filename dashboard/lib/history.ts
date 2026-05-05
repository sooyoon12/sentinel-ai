"use client";

import type { ScanRecord } from "./types";

const KEY = "sentinel-ai:scan-history";
const MAX = 50;

export function loadHistory(): ScanRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScanRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: ScanRecord) {
  if (typeof window === "undefined") return;
  const current = loadHistory();
  const idx = current.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    current[idx] = record;
  } else {
    current.unshift(record);
  }
  const trimmed = current.slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function deleteRecord(id: string) {
  if (typeof window === "undefined") return;
  const current = loadHistory().filter((r) => r.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(current));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function newId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
