"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface Props {
  tenderId: number;
  projectId: string;
  userId: string;
  retrying?: boolean;
}

export default function ProcessButton({ tenderId, projectId, retrying }: Props) {
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
        body: JSON.stringify({ projectId }),
      });

      if (res.ok) {
        setDone(true);
        // Reload after a short delay to show the pending state
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
      <span className="text-sm text-green-600 font-medium">
        Procesando…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleProcess} disabled={loading} size="sm" className="gap-2">
        <Zap className="h-4 w-4" />
        {loading ? "Iniciando…" : retrying ? "Reintentar proceso" : "Procesar"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
