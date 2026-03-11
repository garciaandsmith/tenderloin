"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ScoreButtons from "./ScoreButtons";
import { formatBudget } from "@/lib/utils/formatters";
import type { TrainingTender } from "@/lib/types/app.types";

interface Props {
  tender: TrainingTender | null;
  projectId: string;
  projectName?: string;
}

export default function TrainingCard({ tender, projectId, projectName }: Props) {
  const router = useRouter();
  const [scoring, setScoring] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  if (!tender) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-2xl mb-3">🎉</p>
        <p className="font-semibold">¡Has puntuado todas las licitaciones disponibles!</p>
        <p className="text-sm text-muted-foreground mt-2">
          Vuelve más tarde cuando haya nuevas licitaciones capturadas.
        </p>
      </div>
    );
  }

  async function handleScore(score: number) {
    setSelected(score);
    setScoring(true);

    await fetch(`/api/tenders/${tender!.id}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, score }),
    });

    // Brief pause so the selection is visible, then load the next tender
    await new Promise((r) => setTimeout(r, 400));
    setScoring(false);
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Tender content */}
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-semibold leading-snug">{tender.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{tender.buyer_name}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Filter metadata tags */}
        <div className="flex flex-wrap gap-1.5">
          {tender.cpv && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono bg-muted text-muted-foreground">
              CPV {tender.cpv}
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
          {tender.procedure_type && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
              {tender.procedure_type}
            </span>
          )}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-6">
          {tender.summary}
        </p>
      </div>

      {/* Scoring */}
      <div className="border-t bg-muted/30 px-6 py-4">
        <ScoreButtons onScore={handleScore} disabled={scoring} selected={selected} projectName={projectName} />
        {scoring && (
          <p className="text-center text-xs text-muted-foreground mt-3 animate-pulse">
            Guardando puntuación…
          </p>
        )}
      </div>
    </div>
  );
}
