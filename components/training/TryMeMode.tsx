"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ScoreButtons from "./ScoreButtons";
import ScoreBadge from "@/components/inbox/ScoreBadge";
import { formatBudget } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import type { TestTender } from "@/lib/types/app.types";

interface Props {
  tender: TestTender | null;
  projectId: string;
  projectName?: string;
}

export default function TryMeMode({ tender, projectId, projectName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [userScore, setUserScore] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!tender) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-2xl mb-3">🤖</p>
        <p className="font-semibold">El modelo aún no ha generado predicciones para este proyecto.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Puntúa licitaciones en modo <strong>Entrenar</strong> para que el modelo pueda aprender.
          Las predicciones se generan automáticamente tras el siguiente ciclo de reentrenamiento.
        </p>
      </div>
    );
  }

  function handleGuess(score: number) {
    setUserScore(score);
    setSubmitted(true);
    // Intentionally NOT saving to tender_scores — this is a read-only test.
  }

  function handleNext() {
    // Navigate with the current tender's id as ?skip= so the server picks a different one.
    router.push(`${pathname}?skip=${tender!.id}`);
  }

  const diff =
    userScore !== null ? Math.abs(userScore - tender.model_score) : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Tender content */}
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary text-primary-foreground rounded px-2 py-0.5 text-xs font-bold shrink-0">
            🎯 TEST THE TRAINING
          </div>
          <div className="ml-auto flex items-center gap-3">
            {tender.budget_amount && (
              <span className="text-sm font-medium text-muted-foreground">
                {formatBudget(tender.budget_amount)}
              </span>
            )}
            <a
              href={tender.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-4 hover:text-primary/80 whitespace-nowrap"
            >
              Ver licitación oficial ↗
            </a>
          </div>
        </div>

        <div>
          <h2 className="font-semibold leading-snug">{tender.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{tender.buyer_name}</p>
        </div>

        {/* Filter metadata tags */}
        <div className="flex flex-wrap gap-1.5">
          {tender.cpv && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground">
              {cpvLabel(tender.cpv)}
            </span>
          )}
          {tender.region && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground">
              {tender.region}
            </span>
          )}
          {tender.contract_type && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
              {tender.contract_type}
            </span>
          )}
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
            <ScoreButtons onScore={handleGuess} disabled={false} projectName={projectName} />
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
                <ScoreBadge score={tender.model_score} className="text-base px-4 py-1" />
              </div>
            </div>

            {diff !== null && (
              <p className="text-center text-sm">
                {diff === 0
                  ? "🎯 ¡Coincidencia perfecta!"
                  : diff <= 0.5
                  ? "✅ Muy cerca"
                  : diff <= 1.5
                  ? "✅ Cerca (diferencia de 1 punto)"
                  : diff <= 2.5
                  ? "⚠️ Diferencia de 2 puntos — el modelo puede mejorar"
                  : `❌ Diferencia de ${diff.toFixed(1)} puntos — el modelo necesita más entrenamiento`}
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
