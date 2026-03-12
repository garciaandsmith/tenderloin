"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

interface Props {
  disabled?: boolean;
}

export default function PipelineTriggerButton({ disabled: disabledProp }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function trigger() {
    setLoading(true);
    setResult("idle");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
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
      <Button onClick={trigger} disabled={loading || disabledProp} className="gap-2">
        <Play className="h-4 w-4" />
        {loading ? "Disparando…" : disabledProp ? "Captura completada hoy" : "Ejecutar captura ahora"}
      </Button>
      {result === "success" && (
        <span className="text-sm text-green-600">
          ✓ Workflow disparado. Revisa GitHub Actions para el progreso.
        </span>
      )}
      {result === "error" && (
        <span className="text-sm text-destructive">{errorMsg}</span>
      )}
    </div>
  );
}
