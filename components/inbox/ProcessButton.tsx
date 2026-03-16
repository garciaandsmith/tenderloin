"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

type AnalysisType = "technical" | "administrative";

interface Props {
  tenderId: number;
  projectId: string;
  userId: string;
  analysisType: AnalysisType;
  retrying?: boolean;
}

const LABELS: Record<AnalysisType, { idle: string; retrying: string }> = {
  technical: { idle: "Analizar técnico", retrying: "Reintentar técnico" },
  administrative: { idle: "Analizar administrativo", retrying: "Reintentar administrativo" },
};

export default function ProcessButton({
  tenderId,
  projectId,
  analysisType,
  retrying,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
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
        setDone(true);
        setTimeout(() => window.location.reload(), 1000);
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

  if (done) {
    return (
      <span className="text-sm text-green-600 font-medium">Procesando…</span>
    );
  }

  const label = LABELS[analysisType];

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleProcess} disabled={loading} size="sm" className="gap-2">
        <Zap className="h-4 w-4" />
        {loading ? "Iniciando…" : retrying ? label.retrying : label.idle}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
