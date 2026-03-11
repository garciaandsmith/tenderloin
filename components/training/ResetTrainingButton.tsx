"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { resetTrainingScores } from "@/app/(app)/projects/[projectId]/training/actions";

interface Props {
  projectId: string;
}

export default function ResetTrainingButton({ projectId }: Props) {
  const pathname = usePathname();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setError(null);
    const result = await resetTrainingScores(projectId);
    setResetting(false);
    if (result.error) {
      setError(result.error);
      setConfirming(false);
      return;
    }
    setConfirming(false);
    window.location.replace(pathname);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">¿Seguro? Se borrarán todas las puntuaciones del proyecto.</span>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="text-xs text-destructive underline underline-offset-4 hover:text-destructive/80 disabled:opacity-50"
        >
          {resetting ? "Borrando…" : "Sí, reiniciar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => { setError(null); setConfirming(true); }}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Reiniciar entrenamiento
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
