"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ScoreButtons from "./ScoreButtons";
import TrainingCounter from "./TrainingCounter";
import { formatBudget } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import type { TrainingTender } from "@/lib/types/app.types";

const FETCH_MORE_THRESHOLD = 3;
const BATCH_SIZE = 10;
const CARDS_VISIBLE = 3;

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
  const [scoringIds, setScoringIds] = useState<Set<number>>(new Set());
  const [selectedScores, setSelectedScores] = useState<Map<number, number>>(new Map());
  // If the server returned a full batch, there may be more; otherwise we already have everything.
  const [hasMore, setHasMore] = useState(initialTenders.length >= BATCH_SIZE);
  const [isFetching, setIsFetching] = useState(false);

  // Track all tender IDs we've ever seen so we don't re-fetch them
  const seenIds = useRef<Set<number>>(new Set(initialTenders.map((t) => t.id)));
  // Ref-based lock prevents concurrent fetches without adding to useCallback deps
  const fetchingRef = useRef(false);

  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setIsFetching(true);

    const excludeParam = Array.from(seenIds.current).join(",");
    const url =
      `/api/projects/${projectId}/training-queue?limit=${BATCH_SIZE}` +
      (excludeParam ? `&exclude=${excludeParam}` : "");

    try {
      const res = await fetch(url);
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const { tenders } = (await res.json()) as { tenders: TrainingTender[] };

      if (tenders.length === 0) {
        setHasMore(false);
      } else {
        for (const t of tenders) seenIds.current.add(t.id);
        setQueue((prev) => [...prev, ...tenders]);
        if (tenders.length < BATCH_SIZE) setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      fetchingRef.current = false;
      setIsFetching(false);
    }
  }, [projectId, hasMore]);

  // Pre-fetch more whenever the queue runs low
  useEffect(() => {
    if (queue.length <= FETCH_MORE_THRESHOLD && hasMore && !isFetching) {
      fetchMore();
    }
  }, [queue.length, hasMore, isFetching, fetchMore]);

  async function handleScore(tenderId: number, score: number) {
    if (scoringIds.has(tenderId)) return;

    setScoringIds((prev) => new Set(prev).add(tenderId));
    setSelectedScores((prev) => new Map(prev).set(tenderId, score));

    await fetch(`/api/tenders/${tenderId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, score }),
    });

    // Brief pause so the selection is visible, then remove this card
    await new Promise((r) => setTimeout(r, 300));
    setQueue((prev) => prev.filter((t) => t.id !== tenderId));
    setScoredCount((c) => c + 1);
    setScoringIds((prev) => {
      const next = new Set(prev);
      next.delete(tenderId);
      return next;
    });
    setSelectedScores((prev) => {
      const next = new Map(prev);
      next.delete(tenderId);
      return next;
    });
  }

  const visibleCards = queue.slice(0, CARDS_VISIBLE);
  const isExhausted = queue.length === 0 && !hasMore && !isFetching;
  const isLoading = queue.length === 0 && (hasMore || isFetching);

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
      ) : isLoading ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">Cargando licitaciones…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleCards.map((tender) => {
            const isScoring = scoringIds.has(tender.id);
            const selected = selectedScores.get(tender.id) ?? null;
            return (
              <div key={tender.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                {/* Tender content */}
                <div className="p-4 space-y-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold leading-snug text-sm">{tender.title}</h2>
                      <p className="text-xs text-muted-foreground mt-1">{tender.buyer_name}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {tender.budget_amount && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatBudget(tender.budget_amount)}
                        </span>
                      )}
                      <a
                        href={tender.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline underline-offset-4 hover:text-primary/80 whitespace-nowrap"
                      >
                        Ver ↗
                      </a>
                    </div>
                  </div>

                  {/* Filter metadata tags */}
                  <div className="flex flex-wrap gap-1">
                    {tender.cpv && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
                        {cpvLabel(tender.cpv)}
                      </span>
                    )}
                    {tender.region && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
                        {tender.region}
                      </span>
                    )}
                    {tender.contract_type && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
                        {tender.contract_type}
                      </span>
                    )}
                    {tender.procedure_type && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground capitalize">
                        {tender.procedure_type}
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-5">
                    {tender.summary}
                  </p>
                </div>

                {/* Scoring */}
                <div className="border-t bg-muted/30 px-4 py-3">
                  <ScoreButtons
                    onScore={(score) => handleScore(tender.id, score)}
                    disabled={isScoring}
                    selected={selected}
                    projectName={projectName}
                    compact
                  />
                  {isScoring && (
                    <p className="text-center text-xs text-muted-foreground mt-2 animate-pulse">
                      Guardando…
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
