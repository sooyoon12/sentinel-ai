export type ScanCategory = "sql_injection" | "overflow" | "format_string" | "all";

export interface ScanParams {
  target: string;
  category: ScanCategory;
  concurrency: number;
}

export interface Vulnerability {
  anomaly?: boolean;
  anomaly_type?: string;
  payload?: string;
  body?: string;
  status_code?: number;
  response_time_ms?: number;
  [key: string]: unknown;
}

export type StageName =
  | "fuzz_start"
  | "fuzz_done"
  | "heal_start"
  | "analyze"
  | "patch"
  | "validate"
  | "apply"
  | "complete"
  | "error";

export interface StageEvent {
  stage: StageName;
  ts: string;
  vuln_count?: number;
  vulnerabilities?: Vulnerability[];
  total_attempts?: number;
  results_count?: number;
  status?: "healed" | "clean" | "error";
  target?: string;
  category?: ScanCategory;
  patch_log?: string;
  scan_started?: string;
  healer_returncode?: number;
  where?: string;
  error?: unknown;
  concurrency?: number;
}

export interface LogEvent {
  line: string;
  ts: string;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

export interface ScanRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  params: ScanParams;
  status: "healed" | "clean" | "error" | "running";
  vulnCount: number;
  totalAttempts: number;
  vulnerabilities: Vulnerability[];
  patchLog?: string;
  logs: string[];
}
