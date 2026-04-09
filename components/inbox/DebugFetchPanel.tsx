"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";
import type { DiagnosticResult, DiagnosticStep } from "@/app/api/tenders/[tenderId]/debug-fetch/route";

export default function DebugFetchPanel({ tenderId }: { tenderId: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`/api/tenders/${tenderId}/debug-fetch`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Error desconocido");
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Diagnóstico de documentos</p>
          <p className="text-xs text-muted-foreground">
            Comprueba paso a paso si los documentos son accesibles
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Comprobando…
            </>
          ) : result ? (
            "Repetir"
          ) : (
            "Comprobar"
          )}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <ol className="space-y-2 pt-1">
          {result.steps.map((step, i) => (
            <Step key={i} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Step({ step }: { step: DiagnosticStep }) {
  const muted = step.status === "skip";
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <StatusIcon status={step.status} />
      <div className="min-w-0">
        <span className={muted ? "text-muted-foreground" : undefined}>{step.label}</span>
        {step.detail && (
          <p
            className="text-xs text-muted-foreground font-mono break-all mt-0.5"
            title={step.detail}
          >
            {step.detail}
          </p>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: DiagnosticStep["status"] }) {
  if (status === "ok")
    return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
  if (status === "fail")
    return <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />;
}
