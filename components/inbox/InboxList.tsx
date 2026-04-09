"use client";

import { useState, useEffect, useCallback } from "react";
import type { InboxTender } from "@/lib/types/app.types";
import TenderRow from "./TenderRow";
import RescoreButton from "./RescoreButton";
import { Inbox, Star, CheckCircle } from "lucide-react";

interface Props {
  tenders: InboxTender[];
  projectId: string;
}

type Tab = "all" | "starred" | "processed";

const SCORE_LABELS: Record<number, string> = {
  0: "0 — Revisar",
  1: "1 — Nada",
  2: "2 — Poco",
  3: "3 — Dudoso",
  4: "4 — Bueno",
  5: "5 — Ideal",
};

function getFavoritesKey(projectId: string) {
  return `inbox_favorites_${projectId}`;
}

export default function InboxList({ tenders, projectId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(5);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getFavoritesKey(projectId));
      if (stored) {
        setFavorites(new Set(JSON.parse(stored) as number[]));
      }
    } catch {
      // ignore localStorage errors
    }
  }, [projectId]);

  const toggleFavorite = useCallback(
    (id: number) => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        try {
          localStorage.setItem(getFavoritesKey(projectId), JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [projectId]
  );

  const handleDismiss = useCallback(
    (id: number) => {
      setDismissed((prev) => new Set([...prev, id]));
      fetch(`/api/tenders/${id}/dismiss?projectId=${projectId}`, { method: "DELETE" }).catch(
        () => {
          // Silently fail — the optimistic update stays; a page refresh will restore the tender.
        }
      );
    },
    [projectId]
  );

  if (tenders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Inbox className="h-12 w-12 mb-4 opacity-30" />
        <p className="font-medium">Bandeja vacía</p>
        <p className="text-sm mt-1">
          No hay licitaciones que cumplan los filtros del proyecto con plazo activo.
        </p>
        <p className="text-xs mt-3">
          Comprueba los filtros en <strong>Configuración</strong> o espera a la siguiente captura.
        </p>
      </div>
    );
  }

  // Single pass: compute counts and apply filters simultaneously
  let scoredCount = 0;
  let starredCount = 0;
  let processedCount = 0;
  const filtered: InboxTender[] = [];

  for (const t of tenders) {
    if (dismissed.has(t.id)) continue;
    if (t.model_score !== null) scoredCount++;
    if (favorites.has(t.id)) starredCount++;
    if (t.analysis_technical_status === "done" || t.analysis_administrative_status === "done") processedCount++;

    if (activeTab === "starred" && !favorites.has(t.id)) continue;
    if (activeTab === "processed" && t.analysis_technical_status !== "done" && t.analysis_administrative_status !== "done") continue;
    if (t.model_score !== null) {
      const rounded = Math.round(t.model_score);
      if (rounded < minScore || rounded > maxScore) continue;
    }
    filtered.push(t);
  }

  return (
    <div>
      {/* Header row: tabs + admin rescore button */}
      <div className="flex items-end justify-between mb-4 border-b">
      <div className="flex items-center gap-1">
        <TabButton
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="Todas"
          count={tenders.length}
        />
        <TabButton
          active={activeTab === "starred"}
          onClick={() => setActiveTab("starred")}
          icon={<Star className="h-3.5 w-3.5" />}
          label="Favoritas"
          count={starredCount}
        />
        <TabButton
          active={activeTab === "processed"}
          onClick={() => setActiveTab("processed")}
          icon={<CheckCircle className="h-3.5 w-3.5" />}
          label="Procesadas"
          count={processedCount}
        />
      </div>
      <div className="pb-2">
        <RescoreButton projectId={projectId} />
      </div>
      </div>

      {/* Score filter */}
      {scoredCount > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 border rounded-lg bg-muted/30 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Filtrar por puntuación:
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Mín.</label>
            <select
              value={minScore}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setMinScore(val);
                if (val > maxScore) setMaxScore(val);
              }}
              className="text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {SCORE_LABELS[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Máx.</label>
            <select
              value={maxScore}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setMaxScore(val);
                if (val < minScore) setMinScore(val);
              }}
              className="text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {SCORE_LABELS[n]}
                </option>
              ))}
            </select>
          </div>
          {(minScore > 0 || maxScore < 5) && (
            <button
              onClick={() => { setMinScore(0); setMaxScore(5); }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-muted-foreground mb-3">
        {filtered.length} licitación{filtered.length !== 1 ? "es" : ""} · ordenadas por puntuación
        {scoredCount < tenders.length && (
          <span className="ml-2 text-xs">
            ({scoredCount} puntuada{scoredCount !== 1 ? "s" : ""} por el modelo,{" "}
            {tenders.length - scoredCount} pendiente{tenders.length - scoredCount !== 1 ? "s" : ""})
          </span>
        )}
      </p>

      {/* Column headers */}
      <div className="hidden lg:flex items-center gap-4 px-4 py-2 border-b bg-muted/50 rounded-t-lg text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span className="w-12 shrink-0" title="Puntuación del modelo (0–5). «Pendiente» cuando aún no se ha puntuado.">
          Punt.
        </span>
        <span className="flex-1">Licitación</span>
        <span className="w-24 shrink-0 text-right">Presupuesto</span>
        <span className="w-20 shrink-0 text-right">Plazo</span>
        <span className="w-20 shrink-0 text-right">Añadido</span>
        <span className="w-12 shrink-0" />
      </div>

      {/* Rows */}
      {filtered.length > 0 ? (
        <div className="rounded-lg border overflow-hidden">
          {filtered.map((tender) => (
            <TenderRow
              key={tender.id}
              tender={tender}
              projectId={projectId}
              isFavorited={favorites.has(tender.id)}
              onToggleFavorite={toggleFavorite}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">
            {activeTab === "starred"
              ? "No hay licitaciones marcadas como favoritas todavía."
              : activeTab === "processed"
              ? "No hay licitaciones procesadas todavía."
              : "Ninguna licitación coincide con los filtros de puntuación aplicados."}
          </p>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
      }`}
    >
      {icon}
      {label}
      <span
        className={`ml-0.5 text-xs rounded-full px-1.5 py-0.5 font-normal ${
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
