"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
}

export default function ResetTrainingButton({ projectId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    await fetch(`/api/projects/${projectId}/scores`, { method: "DELETE" });
    setResetting(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">¿Seguro? Se borrarán todas tus puntuaciones.</span>
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
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      Reiniciar entrenamiento
    </button>
  );
}
