"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { WorkflowStatus } from "@/app/api/projects/[projectId]/workflow-status/route";

interface Props {
  projectId: string;
}

const POLL_INTERVAL_MS = 10_000;

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export default function RescoreButton({ projectId }: Props) {
  const router = useRouter();
  const [triggering, setTriggering] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (since?: string): Promise<WorkflowStatus | null> => {
    const url = since
      ? `/api/projects/${projectId}/workflow-status?since=${encodeURIComponent(since)}`
      : `/api/projects/${projectId}/workflow-status`;
    const res = await fetch(url);
    if (!res.ok) {
      setStatusError("No se pudo obtener el estado del workflow");
      return null;
    }
    const data: WorkflowStatus = await res.json();
    setWorkflowStatus(data);
    setStatusError(null);
    return data;
  }, [projectId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const sinceRef = useRef<string | undefined>(undefined);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus(sinceRef.current);
      if (status?.status === "completed") {
        stopPolling();
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchStatus, stopPolling, router]);

  // On mount: fetch the last known status (no since filter — just for display)
  useEffect(() => {
    fetchStatus();
    return stopPolling;
  }, [fetchStatus, stopPolling]);

  async function handleRefresh() {
    setTriggering(true);
    setTriggerError(null);

    try {
      const triggerTime = new Date().toISOString();
      const res = await fetch(`/api/projects/${projectId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setTriggerError(data.error ?? "Error desconocido");
        return;
      }
      // Store trigger time so polling only tracks runs created after this moment
      sinceRef.current = triggerTime;
      // Give GitHub a moment to register the run, then start polling
      await new Promise((r) => setTimeout(r, 3_000));
      await fetchStatus(sinceRef.current);
      startPolling();
    } catch {
      setTriggerError("Error de red");
    } finally {
      setTriggering(false);
    }
  }

  const isRunning =
    workflowStatus?.status === "queued" || workflowStatus?.status === "in_progress";
  const spinning = triggering || isRunning;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={spinning}
        className="gap-2"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
        {triggering ? "Lanzando…" : isRunning ? "Actualizando…" : "Actualizar Inbox"}
      </Button>

      <span className="text-xs text-muted-foreground">
        {statusError ? (
          <span className="text-destructive">{statusError}</span>
        ) : triggerError ? (
          <span className="text-destructive">{triggerError}</span>
        ) : workflowStatus?.status === "never" ? (
          "Sin ejecuciones previas"
        ) : isRunning ? (
          <a
            href={workflowStatus?.run_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            En progreso…
          </a>
        ) : workflowStatus?.status === "completed" ? (
          <>
            {workflowStatus.updated_at ? relativeTime(workflowStatus.updated_at) : ""}
            {workflowStatus.conclusion === "success" ? (
              <span className="ml-1 text-green-600">✓</span>
            ) : (
              <>
                <span className="ml-1 text-destructive">✗</span>
                {workflowStatus.run_url && (
                  <a
                    href={workflowStatus.run_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline underline-offset-2"
                  >
                    ver log
                  </a>
                )}
              </>
            )}
          </>
        ) : null}
      </span>
    </div>
  );
}
