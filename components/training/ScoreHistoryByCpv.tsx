import { cpvLabel } from "@/lib/utils/cpv";
import type { ScoredTenderEntry } from "@/lib/types/app.types";

interface Props {
  tenders: ScoredTenderEntry[];
}

const SCORE_LABELS: Record<number, string> = {
  0: "Revisar",
  1: "Nada",
  2: "Poco",
  3: "Dudoso",
  4: "Bueno",
  5: "Ideal",
};

const SCORE_COLORS: Record<number, string> = {
  0: "bg-gray-100 text-gray-600",
  1: "bg-red-100 text-red-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-yellow-100 text-yellow-700",
  4: "bg-green-100 text-green-700",
  5: "bg-blue-100 text-blue-700",
};

function ScorePill({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${SCORE_COLORS[score] ?? SCORE_COLORS[0]}`}>
      {score} · {SCORE_LABELS[score] ?? "—"}
    </span>
  );
}

export default function ScoreHistoryByCpv({ tenders }: Props) {
  if (tenders.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-2xl mb-3">📋</p>
        <p className="font-semibold">Sin historial de puntuaciones todavía.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Puntúa licitaciones en modo <strong>Entrenar</strong> para ver el historial aquí.
        </p>
      </div>
    );
  }

  // Build per-CPV breakdown.
  const cpvMap = new Map<string, { count: number; scores: number[] }>();
  for (const t of tenders) {
    const key = t.cpv ?? "Sin CPV";
    const entry = cpvMap.get(key) ?? { count: 0, scores: [] };
    entry.count++;
    entry.scores.push(t.score);
    cpvMap.set(key, entry);
  }

  const cpvRows = Array.from(cpvMap.entries())
    .map(([cpv, { count, scores }]) => ({
      cpv,
      count,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      dist: [0, 1, 2, 3, 4, 5].map((s) => scores.filter((x) => x === s).length),
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* CPV breakdown summary */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-medium">Desglose por código CPV</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Distribución de puntuaciones agrupada por CPV — útil para detectar ruido por categoría.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">CPV</th>
                <th className="text-right px-3 py-2 font-medium">#</th>
                <th className="text-right px-3 py-2 font-medium">Media</th>
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <th key={s} className="text-right px-3 py-2 font-medium">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cpvRows.map((row) => (
                <tr key={row.cpv} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs">{cpvLabel(row.cpv)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">{row.count}</td>
                  <td className="text-right px-3 py-2 tabular-nums">{row.avg.toFixed(1)}</td>
                  {row.dist.map((n, i) => (
                    <td key={i} className={`text-right px-3 py-2 tabular-nums ${n > 0 ? "font-medium" : "text-muted-foreground"}`}>
                      {n > 0 ? n : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent scored tenders list */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-medium">Últimas {Math.min(tenders.length, 50)} puntuaciones</p>
        </div>
        <div className="divide-y">
          {tenders.slice(0, 50).map((t) => (
            <div key={`${t.tender_id}-${t.scored_at}`} className="flex items-center gap-3 px-4 py-3">
              <ScorePill score={t.score} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{t.title}</p>
                <div className="flex gap-2 mt-0.5">
                  {t.cpv && (
                    <span className="text-xs text-muted-foreground">{cpvLabel(t.cpv)}</span>
                  )}
                  {t.region && (
                    <span className="text-xs text-muted-foreground">{t.region}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(t.scored_at).toLocaleDateString("es-ES")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
