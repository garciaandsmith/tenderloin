"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

type AnalysisType = "technical" | "administrative";

interface Props {
  tenderId: number;
  projectId: string;
  userId: string;
  analysisType: AnalysisType;
  analysisStatus?: string | null;
  retrying?: boolean;
}

const LABELS: Record<AnalysisType, { idle: string; retrying: string; done: string }> = {
  technical: { idle: "Analizar técnico", retrying: "Reintentar técnico", done: "Reanalizar técnico" },
  administrative: { idle: "Analizar administrativo", retrying: "Reintentar administrativo", done: "Reanalizar administrativo" },
};

export default function ProcessButton({
  tenderId,
  projectId,
  analysisType,
  analysisStatus,
  retrying,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleProcess() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tenders/${tenderId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, analysisType }),
      });

      if (res.ok) {
        setQueued(true);
        // Refresh the server component immediately so the pending state is visible.
        // AnalysisPoller (rendered by the parent page) will continue polling every
        // 15 s until the analysis reaches done or error.
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Error al iniciar el proceso");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (queued) {
    return (
      <span className="text-sm text-muted-foreground">Análisis en curso…</span>
    );
  }

  const label = LABELS[analysisType];
  const labelKey = analysisStatus === "done" ? "done" : retrying ? "retrying" : "idle";

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleProcess} disabled={loading} size="sm" className="gap-2">
        <Zap className="h-4 w-4" />
        {loading ? "Iniciando…" : label[labelKey]}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
