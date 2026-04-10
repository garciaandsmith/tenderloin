"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils/formatters";
import { RefreshCw, History, Clock, CalendarRange, Loader2 } from "lucide-react";

interface Props {
  lastRunAt: string | null;
}

type Mode = "fresh" | "historical";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2018 }, (_, i) =>
  String(currentYear - i)
);

function toYYYYMM(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}`;
}

export default function IngestionLoaderPanel({ lastRunAt }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("fresh");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [fromYear, setFromYear] = useState(String(currentYear - 1));
  const [fromMonth, setFromMonth] = useState("1");
  const [toYear, setToYear] = useState(String(currentYear));
  const [toMonth, setToMonth] = useState(String(new Date().getMonth() + 1));

  async function handleFresh() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingestion/trigger", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to trigger ingestion" });
      } else {
        setMessage({ type: "success", text: "Ingestion workflow triggered. Results will appear shortly." });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Network error — could not reach server" });
    } finally {
      setLoading(false);
    }
  }

  async function handleHistorical() {
    const startMonth = toYYYYMM(fromYear, fromMonth);
    const endMonth = toYYYYMM(toYear, toMonth);

    if (startMonth > endMonth) {
      setMessage({ type: "error", text: "Start month must be before or equal to end month" });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingestion/historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startMonth, endMonth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to trigger historical ingestion" });
      } else {
        setMessage({
          type: "success",
          text: `Historical workflow triggered for ${startMonth} → ${endMonth}. This may take several minutes.`,
        });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Network error — could not reach server" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Data Loader</span>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          <button
            onClick={() => { setMode("fresh"); setMessage(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
              mode === "fresh"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Fresh Data
          </button>
          <button
            onClick={() => { setMode("historical"); setMessage(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
              mode === "historical"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Historical
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <p
          className={`text-sm px-3 py-2 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Fresh mode */}
      {mode === "fresh" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-muted-foreground">
              Capture tenders published since the last ingestion run. Overlaps
              the previous window by 2 hours to avoid gaps.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Last ingestion:</span>
              <span>
                {lastRunAt ? formatDate(lastRunAt) : "No runs recorded yet"}
              </span>
            </div>
          </div>
          <button
            onClick={handleFresh}
            disabled={loading}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {loading ? "Triggering…" : "Capture Now"}
          </button>
        </div>
      )}

      {/* Historical mode */}
      {mode === "historical" && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 space-y-3">
            <p className="text-sm text-muted-foreground">
              Load tenders from a specific date range by downloading monthly
              data packages. Existing records are updated only if a newer
              version is available.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  From
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(e.target.value)}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fromYear}
                    onChange={(e) => setFromYear(e.target.value)}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <span className="text-muted-foreground pb-1.5">→</span>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  To
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(e.target.value)}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={toYear}
                    onChange={(e) => setToYear(e.target.value)}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleHistorical}
            disabled={loading}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <History className="h-4 w-4" />
            )}
            {loading ? "Triggering…" : "Load Historical"}
          </button>
        </div>
      )}
    </div>
  );
}
