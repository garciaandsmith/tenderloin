"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Props {
  projectId: string;
}

export default function RescoreButton({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRescore() {
    setLoading(true);
    setResult("idle");
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/rescore`, { method: "POST" });
      if (res.ok) {
        setResult("success");
      } else {
        const data = await res.json();
        setErrorMsg(data.error ?? "Error desconocido");
        setResult("error");
      }
    } catch {
      setErrorMsg("Error de red");
      setResult("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRescore}
        disabled={loading}
        className="gap-2"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Lanzando…" : "Recalcular puntuaciones"}
      </Button>
      {result === "success" && (
        <span className="text-sm text-green-600">
          ✓ Workflow disparado. Las puntuaciones se actualizarán en breve.
        </span>
      )}
      {result === "error" && (
        <span className="text-sm text-destructive">{errorMsg}</span>
      )}
    </div>
  );
}
