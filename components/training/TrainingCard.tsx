"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ScoreButtons from "./ScoreButtons";
import TrainingCounter from "./TrainingCounter";
import { formatBudget } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import type { TrainingTender } from "@/lib/types/app.types";

const FETCH_MORE_THRESHOLD = 3;
const BATCH_SIZE = 10;

interface Props {
  initialTenders: TrainingTender[];
  initialCount: number;
  projectId: string;
  projectName?: string;
}

export default function TrainingCard({
  initialTenders,
  initialCount,
  projectId,
  projectName,
}: Props) {
  const [queue, setQueue] = useState<TrainingTender[]>(initialTenders);
  const [scoredCount, setScoredCount] = useState(initialCount);
  const [scoring, setScoring] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  // Track all tender IDs we've ever seen so we don't re-fetch them
  const seenIds = useRef<Set<number>>(new Set(initialTenders.map((t) => t.id)));

  const fetchMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;

    const excludeParam = Array.from(seenIds.current).join(",");
    const url =
      `/api/projects/${projectId}/training-queue?limit=${BATCH_SIZE}` +
      (excludeParam ? `&exclude=${excludeParam}` : "");

    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const { tenders } = (await res.json()) as { tenders: TrainingTender[] };

      if (tenders.length === 0) {
        setHasMore(false);
      } else {
        for (const t of tenders) seenIds.current.add(t.id);
        setQueue((prev) => [...prev, ...tenders]);
        if (tenders.length < BATCH_SIZE) setHasMore(false);
      }
    } finally {
      loadingRef.current = false;
    }
  }, [projectId, hasMore]);

  // Pre-fetch more whenever the queue runs low
  useEffect(() => {
    if (queue.length <= FETCH_MORE_THRESHOLD && hasMore) {
      fetchMore();
    }
  }, [queue.length, hasMore, fetchMore]);

  async function handleScore(score: number) {
    const current = queue[0];
    if (!current || scoring) return;

    setSelected(score);
    setScoring(true);

    await fetch(`/api/tenders/${current.id}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, score }),
    });

    // Brief pause so the selection is visible, then immediately advance
    await new Promise((r) => setTimeout(r, 300));
    setQueue((prev) => prev.slice(1));
    setScoredCount((c) => c + 1);
    setScoring(false);
    setSelected(null);
  }

  const current = queue[0] ?? null;
  const isExhausted = !current && !hasMore && !loadingRef.current;

  return (
    <div className="space-y-4">
      <TrainingCounter count={scoredCount} />

      {isExhausted ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-2xl mb-3">🎉</p>
          <p className="font-semibold">¡Has puntuado todas las licitaciones disponibles!</p>
          <p className="text-sm text-muted-foreground mt-2">
            Vuelve más tarde cuando haya nuevas licitaciones capturadas.
          </p>
        </div>
      ) : !current ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">Cargando licitaciones…</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Tender content */}
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="font-semibold leading-snug">{current.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{current.buyer_name}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {current.budget_amount && (
                  <span className="text-sm font-medium text-muted-foreground">
                    {formatBudget(current.budget_amount)}
                  </span>
                )}
                <a
                  href={current.link}
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
              {current.cpv && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground">
                  {cpvLabel(current.cpv)}
                </span>
              )}
              {current.region && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground">
                  {current.region}
                </span>
              )}
              {current.contract_type && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
                  {current.contract_type}
                </span>
              )}
              {current.procedure_type && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
                  {current.procedure_type}
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-6">
              {current.summary}
            </p>
          </div>

          {/* Scoring */}
          <div className="border-t bg-muted/30 px-6 py-4">
            <ScoreButtons
              onScore={handleScore}
              disabled={scoring}
              selected={selected}
              projectName={projectName}
            />
            {scoring && (
              <p className="text-center text-xs text-muted-foreground mt-3 animate-pulse">
                Guardando puntuación…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
