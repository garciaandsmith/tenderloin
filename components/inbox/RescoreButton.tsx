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

  const fetchStatus = useCallback(async (): Promise<WorkflowStatus | null> => {
    const res = await fetch(`/api/projects/${projectId}/workflow-status`);
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

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (status?.status === "completed") {
        stopPolling();
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchStatus, stopPolling, router]);

  // On mount: fetch status and start polling if a run is already in progress
  useEffect(() => {
    fetchStatus().then((status) => {
      if (status?.status === "queued" || status?.status === "in_progress") {
        startPolling();
      }
    });
    return stopPolling;
  }, [fetchStatus, startPolling, stopPolling]);

  async function handleRefresh() {
    setTriggering(true);
    setTriggerError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setTriggerError(data.error ?? "Error desconocido");
        return;
      }
      // Give GitHub a moment to register the run, then start polling
      await new Promise((r) => setTimeout(r, 3_000));
      await fetchStatus();
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
        {triggering ? "Lanzando…" : isRunning ? "Actualizando…" : "Actualizar puntuaciones"}
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
