"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ScoreButtons from "./ScoreButtons";
import ScoreBadge from "@/components/inbox/ScoreBadge";
import { formatBudget } from "@/lib/utils/formatters";
import type { TrainingTender } from "@/lib/types/app.types";

interface Props {
  tender: TrainingTender | null;
  projectId: string;
}

export default function TryMeMode({ tender, projectId }: Props) {
  const router = useRouter();
  const [userScore, setUserScore] = useState<number | null>(null);
  const [modelScore, setModelScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!tender) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-2xl mb-3">🤔</p>
        <p className="font-semibold">No hay licitaciones sin puntuar disponibles.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Primero entrena el modelo en el modo <strong>Entrenar</strong>.
        </p>
      </div>
    );
  }

  async function handleGuess(score: number) {
    setUserScore(score);
    setLoading(true);

    // Fetch the model score for this tender (if available)
    const res = await fetch(`/api/tenders/${tender!.id}/model-score?project_id=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setModelScore(data.model_score ?? null);
    } else {
      // Model hasn't scored this tender yet — show null
      setModelScore(null);
    }

    // Also save the user's score as a training label
    await fetch(`/api/tenders/${tender!.id}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, score }),
    });

    setSubmitted(true);
    setLoading(false);
  }

  function handleNext() {
    setUserScore(null);
    setModelScore(null);
    setSubmitted(false);
    router.refresh();
  }

  const diff = userScore !== null && modelScore !== null ? Math.abs(userScore - modelScore) : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Tender content */}
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary text-primary-foreground rounded px-2 py-0.5 text-xs font-bold shrink-0">
            🎯 TRY ME
          </div>
          {tender.budget_amount && (
            <span className="text-sm font-medium text-muted-foreground ml-auto">
              {formatBudget(tender.budget_amount)}
            </span>
          )}
        </div>

        <div>
          <h2 className="font-semibold leading-snug">{tender.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{tender.buyer_name}</p>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-6">
          {tender.summary}
        </p>
      </div>

      {/* Scoring / Result */}
      <div className="border-t bg-muted/30 px-6 py-4">
        {!submitted ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-center mb-3">
              ¿Qué puntuación le darías? El modelo revelará su predicción al enviar.
            </p>
            <ScoreButtons onScore={handleGuess} disabled={loading} />
            {loading && (
              <p className="text-center text-xs text-muted-foreground mt-3 animate-pulse">
                Consultando predicción del modelo…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Tu puntuación</p>
                <ScoreBadge score={userScore} className="text-base px-4 py-1" />
              </div>
              <div className="text-2xl text-muted-foreground">vs</div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Predicción del modelo</p>
                {modelScore !== null ? (
                  <ScoreBadge score={modelScore} className="text-base px-4 py-1" />
                ) : (
                  <span className="text-xs text-muted-foreground">Sin modelo entrenado aún</span>
                )}
              </div>
            </div>

            {diff !== null && (
              <p className="text-center text-sm">
                {diff === 0
                  ? "🎯 ¡Coincidencia perfecta!"
                  : diff === 1
                  ? "✅ Muy cerca (diferencia de 1 punto)"
                  : diff === 2
                  ? "⚠️ Diferencia de 2 puntos — el modelo puede mejorar"
                  : `❌ Diferencia de ${diff} puntos — el modelo necesita más entrenamiento`}
              </p>
            )}

            <div className="text-center">
              <button
                onClick={handleNext}
                className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Siguiente licitación →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
