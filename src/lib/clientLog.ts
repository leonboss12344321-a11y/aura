// Real-time in-browser log store. Captures console.error/warn, uncaught errors,
// unhandled promise rejections, and errors reported from the React ErrorBoundary.
// The Owner Console subscribes to this store for live viewing + export.

export type ClientLogLevel = "error" | "warn" | "boundary" | "info";

export interface ClientLogEntry {
  id: string;
  ts: number;
  level: ClientLogLevel;
  source: string;
  message: string;
  stack?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const STORAGE_KEY = "lovable_client_logs_v1";

type Listener = (entries: ClientLogEntry[]) => void;

class LogStore {
  private entries: ClientLogEntry[] = [];
  private listeners = new Set<Listener>();
  private installed = false;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw).slice(-MAX_ENTRIES);
    } catch { /* ignore */ }
  }

  getAll(): ClientLogEntry[] { return this.entries; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.entries);
    return () => { this.listeners.delete(fn); };
  }

  clear() {
    this.entries = [];
    this.persist();
    this.emit();
  }

  add(entry: Omit<ClientLogEntry, "id" | "ts"> & Partial<Pick<ClientLogEntry, "id" | "ts">>) {
    const full: ClientLogEntry = {
      id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: entry.ts || Date.now(),
      level: entry.level,
      source: entry.source,
      message: entry.message,
      stack: entry.stack,
      url: entry.url || (typeof window !== "undefined" ? window.location.pathname : undefined),
      meta: entry.meta,
    };
    this.entries = [...this.entries.slice(-(MAX_ENTRIES - 1)), full];
    this.persist();
    this.emit();
  }

  private persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries)); } catch { /* quota */ }
  }

  private emit() {
    for (const l of this.listeners) l(this.entries);
  }

  install() {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;

    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      try { this.add({ level: "error", source: "console.error", message: stringifyArgs(args), stack: extractStack(args) }); }
      catch { /* ignore */ }
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      try { this.add({ level: "warn", source: "console.warn", message: stringifyArgs(args) }); }
      catch { /* ignore */ }
      origWarn(...args);
    };

    window.addEventListener("error", (e: ErrorEvent) => {
      this.add({
        level: "error",
        source: "window.onerror",
        message: e.message || String(e.error),
        stack: e.error?.stack,
        meta: { filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      this.add({
        level: "error",
        source: "unhandledrejection",
        message: reason?.message || String(reason),
        stack: reason?.stack,
      });
    });
  }
}

function stringifyArgs(args: unknown[]): string {
  return args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");
}

function extractStack(args: unknown[]): string | undefined {
  for (const a of args) if (a instanceof Error && a.stack) return a.stack;
  return undefined;
}

export const clientLog = new LogStore();

export function exportLogsJson(entries: ClientLogEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  triggerDownload(blob, `client-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
}

export function exportLogsCsv(entries: ClientLogEntry[]) {
  const header = ["timestamp", "level", "source", "url", "message", "stack"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, "\\n")}"`;
  const rows = entries.map((e) => [
    new Date(e.ts).toISOString(), e.level, e.source, e.url || "", e.message, e.stack || "",
  ].map(escape).join(","));
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
  triggerDownload(blob, `client-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
