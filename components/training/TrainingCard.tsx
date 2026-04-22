"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ScoreButtons from "./ScoreButtons";
import TrainingCounter from "./TrainingCounter";
import { formatBudget } from "@/lib/utils/formatters";
import type { TrainingTender } from "@/lib/types/app.types";

type RetrainStatus = "idle" | "loading" | "done" | "error";

const FETCH_MORE_THRESHOLD = 3;
const BATCH_SIZE = 10;
const SLOTS = 5;

type SlotData =
  | { status: "filled"; tender: TrainingTender }
  | { status: "processing"; tender: TrainingTender; score: number }
  | { status: "loading" }
  | { status: "empty" };

const SCORE_COLORS: Record<number, string> = {
  0: "bg-gray-100 text-gray-600 ring-gray-300",
  1: "bg-red-50 text-red-700 ring-red-300",
  2: "bg-orange-50 text-orange-700 ring-orange-300",
  3: "bg-yellow-50 text-yellow-700 ring-yellow-300",
  4: "bg-green-50 text-green-700 ring-green-300",
  5: "bg-blue-50 text-blue-700 ring-blue-300",
};

const SCORE_LABELS: Record<number, string> = {
  0: "REVISAR", 1: "NULA", 2: "ESCASA",
  3: "SUFICIENTE", 4: "BUENA", 5: "EXCELENTE",
};

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
  const [slots, setSlots] = useState<SlotData[]>(() =>
    Array.from({ length: SLOTS }, (_, i) =>
      initialTenders[i]
        ? { status: "filled", tender: initialTenders[i] }
        : { status: "empty" }
    )
  );
  const [queue, setQueue] = useState<TrainingTender[]>(initialTenders.slice(SLOTS));
  const [scoredCount, setScoredCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialTenders.length >= BATCH_SIZE);
  const [isFetching, setIsFetching] = useState(false);
  const [pendingRetrainCount, setPendingRetrainCount] = useState(0);
  const [retrainStatus, setRetrainStatus] = useState<RetrainStatus>("idle");
  const [scoreError, setScoreError] = useState<string | null>(null);

  const seenIds = useRef<Set<number>>(new Set(initialTenders.map((t) => t.id)));
  const fetchingRef = useRef(false);
  // Refs so async handlers always read the latest values without stale closures
  const queueRef = useRef<TrainingTender[]>(initialTenders.slice(SLOTS));
  const hasMoreRef = useRef(initialTenders.length >= BATCH_SIZE);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

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
        // Any loading slots become empty
        setSlots((prev) =>
          prev.map((s) => (s.status === "loading" ? { status: "empty" } : s))
        );
      } else {
        for (const t of tenders) seenIds.current.add(t.id);
        if (tenders.length < BATCH_SIZE) setHasMore(false);

        // Fill loading slots first, put the rest in the queue
        setSlots((prev) => {
          let idx = 0;
          const next = prev.map((slot) =>
            slot.status === "loading" && idx < tenders.length
              ? { status: "filled" as const, tender: tenders[idx++] }
              : slot
          );
          const leftover = tenders.slice(idx);
          if (leftover.length > 0) {
            setQueue((q) => {
              const updated = [...q, ...leftover];
              queueRef.current = updated;
              return updated;
            });
          }
          return next;
        });
      }
    } catch {
      setHasMore(false);
      setSlots((prev) =>
        prev.map((s) => (s.status === "loading" ? { status: "empty" } : s))
      );
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

  // Warn the user before leaving if they have scores that haven't triggered a retrain yet
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingRetrainCount > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingRetrainCount]);

  async function handleRetrain() {
    setRetrainStatus("loading");
    try {
      const res = await fetch(`/api/projects/${projectId}/retrain`, { method: "POST" });
      if (!res.ok) throw new Error("dispatch failed");
      setPendingRetrainCount(0);
      setRetrainStatus("done");
    } catch {
      setRetrainStatus("error");
    }
  }

  async function handleScore(slotIndex: number, tenderId: number, score: number) {
    const slot = slots[slotIndex];
    if (slot.status !== "filled") return;

    setScoreError(null);

    // 1. Show processing overlay on this slot
    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIndex ? { status: "processing", tender: slot.tender, score } : s
      )
    );

    // 2. Save score
    try {
      const res = await fetch(`/api/tenders/${tenderId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, score }),
      });
      if (!res.ok) throw new Error("submit-failed");
    } catch {
      // Revert slot so the user can try again
      setSlots((prev) =>
        prev.map((s, i) =>
          i === slotIndex ? { status: "filled", tender: slot.tender } : s
        )
      );
      setScoreError("No se pudo guardar la puntuación. Por favor, inténtalo de nuevo.");
      return;
    }

    // 3. Increment the scored counter and mark as pending retrain
    setScoredCount((c) => c + 1);
    setPendingRetrainCount((c) => c + 1);
    setRetrainStatus("idle");

    // 4. Transition slot: fill from queue, or go to loading/empty
    const next = queueRef.current[0];
    if (next) {
      const remaining = queueRef.current.slice(1);
      queueRef.current = remaining;
      setQueue(remaining);
      setSlots((prev) =>
        prev.map((s, i) =>
          i === slotIndex ? { status: "filled", tender: next } : s
        )
      );
    } else if (hasMoreRef.current) {
      setSlots((prev) =>
        prev.map((s, i) => (i === slotIndex ? { status: "loading" } : s))
      );
      fetchMore();
    } else {
      setSlots((prev) =>
        prev.map((s, i) => (i === slotIndex ? { status: "empty" } : s))
      );
    }
  }

  const isExhausted =
    slots.every((s) => s.status === "empty") && !hasMore && !isFetching;

  return (
    <div className="space-y-4">
      <TrainingCounter count={scoredCount} />

      {scoreError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">{scoreError}</p>
          <button
            onClick={() => setScoreError(null)}
            className="ml-4 shrink-0 text-sm text-red-600 hover:text-red-800 underline underline-offset-2"
          >
            Cerrar
          </button>
        </div>
      )}

      {pendingRetrainCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            {retrainStatus === "done"
              ? "Reentrenamiento iniciado. El modelo se actualizará en breve."
              : retrainStatus === "error"
              ? "Error al iniciar el reentrenamiento. Inténtalo de nuevo."
              : `${pendingRetrainCount} puntuación${pendingRetrainCount !== 1 ? "es" : ""} pendiente${pendingRetrainCount !== 1 ? "s" : ""} de reentrenamiento.`}
          </p>
          {retrainStatus !== "done" && (
            <button
              onClick={handleRetrain}
              disabled={retrainStatus === "loading"}
              className="ml-4 shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {retrainStatus === "loading" ? "Iniciando…" : "Guardar y reentrenar"}
            </button>
          )}
        </div>
      )}

      {isExhausted ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-2xl mb-3">🎉</p>
          <p className="font-semibold">¡Has puntuado todas las licitaciones disponibles!</p>
          <p className="text-sm text-muted-foreground mt-2">
            Vuelve más tarde cuando haya nuevas licitaciones capturadas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((slot, i) => {
            if (slot.status === "empty") return null;

            if (slot.status === "loading") {
              return (
                <div
                  key={`slot-loading-${i}`}
                  className="rounded-lg border bg-card overflow-hidden animate-pulse"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                      <div className="h-3 bg-muted rounded w-20" />
                    </div>
                    <div className="flex gap-1.5">
                      <div className="h-5 bg-muted rounded w-24" />
                      <div className="h-5 bg-muted rounded w-16" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-11/12" />
                      <div className="h-3 bg-muted rounded w-4/5" />
                      <div className="h-3 bg-muted rounded w-5/6" />
                    </div>
                  </div>
                  <div className="border-t bg-muted/30 px-6 py-4">
                    <div className="h-14 bg-muted rounded" />
                  </div>
                </div>
              );
            }

            // "filled" and "processing" share the same card layout
            const tender = slot.tender;
            const isProcessing = slot.status === "processing";

            return (
              <div
                key={tender.id}
                className="relative rounded-lg border bg-card overflow-hidden"
              >
                {/* Card content — dims when processing */}
                <div className={isProcessing ? "opacity-40 pointer-events-none select-none" : ""}>
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

                    <div className="flex flex-wrap gap-1.5">
                      {tender.cpv_labels?.map((label) => (
                        <span key={label} className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground">
                          {label}
                        </span>
                      ))}
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

                    <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4">
                      {tender.summary}
                    </p>
                  </div>

                  <div className="border-t bg-muted/30 px-6 py-4">
                    <ScoreButtons
                      onScore={(score) => handleScore(i, tender.id, score)}
                      disabled={isProcessing}
                      projectName={projectName}
                    />
                  </div>
                </div>

                {/* Processing overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                    <div
                      className={`flex flex-col items-center rounded-xl px-8 py-4 ring-2 ${SCORE_COLORS[slot.score]}`}
                    >
                      <span className="text-4xl font-bold">{slot.score}</span>
                      <span className="text-sm font-semibold mt-1 tracking-wide">
                        {SCORE_LABELS[slot.score]}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground animate-pulse">Guardando…</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
