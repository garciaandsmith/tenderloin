"use client";

import { useState, useRef, useEffect } from "react";
import { Settings2, ExternalLink, RotateCcw } from "lucide-react";
import PipelineSortHeader from "@/components/pipeline/PipelineSortHeader";
import PipelinePagination from "@/components/pipeline/PipelinePagination";
import { formatDate, formatBudget, daysUntil } from "@/lib/utils/formatters";
import { cpvLabelOnly } from "@/lib/utils/cpv";
import { nutsLabel } from "@/lib/utils/nuts";
import { cn } from "@/lib/utils";
import type { TenderRow } from "@/components/ingestion/IngestionTable";

export type { TenderRow };

// ─── Column definitions ───────────────────────────────────────────────────────

type ColKey =
  | "contract_type"
  | "procedure_type"
  | "cpv"
  | "cpv_codes"
  | "region"
  | "buyer_type"
  | "budget_amount"
  | "lot_count"
  | "duration_months"
  | "published_at"
  | "deadline_at"
  | "created_at"
  | "status";

interface ColDef {
  key: ColKey;
  label: string;
  sortField?: string;
  defaultVisible: boolean;
  align?: "right" | "left";
  width?: string;
}

const COLUMNS: ColDef[] = [
  { key: "cpv_codes",       label: "CPV",            defaultVisible: true,  width: "240px" },
  { key: "region",          label: "Región",         defaultVisible: true,  width: "160px" },
  { key: "status",          label: "Estado",         defaultVisible: true,  width: "110px" },
  { key: "created_at",      label: "Creado",         sortField: "created_at",   defaultVisible: true,  align: "right", width: "110px" },
  { key: "deadline_at",     label: "Plazo",          sortField: "deadline_at",  defaultVisible: false, align: "right", width: "110px" },
  { key: "contract_type",   label: "Tipo contrato",  defaultVisible: false, width: "110px" },
  { key: "procedure_type",  label: "Procedimiento",  defaultVisible: false, width: "130px" },
  { key: "cpv",             label: "CPV (código)",   defaultVisible: false, width: "160px" },
  { key: "buyer_type",      label: "Tipo organismo", defaultVisible: false, width: "130px" },
  { key: "budget_amount",   label: "Presupuesto",    sortField: "budget_amount",    defaultVisible: false, align: "right", width: "110px" },
  { key: "lot_count",       label: "Lotes",          sortField: "lot_count",        defaultVisible: false, align: "right", width: "60px" },
  { key: "duration_months", label: "Duración (m)",   sortField: "duration_months",  defaultVisible: false, align: "right", width: "100px" },
  { key: "published_at",    label: "Publicado",      sortField: "published_at",     defaultVisible: false, align: "right", width: "110px" },
];

const DEFAULT_VISIBLE = new Set<ColKey>(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
);

// ─── Status labels ────────────────────────────────────────────────────────────

const PROCUREMENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PUB: { label: "Publicado",     className: "bg-blue-100 text-blue-800" },
  ADJ: { label: "Adjudicado",    className: "bg-green-100 text-green-800" },
  FOR: { label: "Formalizado",   className: "bg-emerald-100 text-emerald-800" },
  EV:  { label: "En evaluación", className: "bg-amber-100 text-amber-800" },
  AN:  { label: "Anunciado",     className: "bg-purple-100 text-purple-800" },
};

// ─── Contract type labels ─────────────────────────────────────────────────────

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  services:   "Servicios",
  supplies:   "Suministros",
  works:      "Obras",
  concession: "Concesión",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tenders: TenderRow[];
  currentSort: string;
  currentDir: string;
  totalPages: number;
  currentPage: number;
  perPage: number;
  filteredCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineTable({
  tenders,
  currentSort,
  currentDir,
  totalPages,
  currentPage,
  perPage,
  filteredCount,
}: Props) {
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE));
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setShowColPanel(false);
      }
    }
    if (showColPanel) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColPanel]);

  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetCols() {
    setVisibleCols(new Set(DEFAULT_VISIBLE));
  }

  const hiddenFromDefault =
    COLUMNS.filter((c) => c.defaultVisible && !visibleCols.has(c.key)).length +
    COLUMNS.filter((c) => !c.defaultVisible && visibleCols.has(c.key)).length;

  const activeCols = COLUMNS.filter((c) => visibleCols.has(c.key));

  if (tenders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <p className="font-medium">No hay licitaciones</p>
        <p className="text-sm mt-1">Prueba a ajustar los filtros o la búsqueda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredCount.toLocaleString("es-ES")} licitación{filteredCount !== 1 ? "es" : ""}
          {totalPages > 1 ? ` · página ${currentPage} de ${totalPages}` : ""}
        </p>

        {/* Column picker */}
        <div className="relative" ref={colPanelRef}>
          <button
            onClick={() => setShowColPanel((v) => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md transition-colors",
              showColPanel
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <Settings2 className="h-4 w-4" />
            Columnas
            {hiddenFromDefault > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">
                {hiddenFromDefault}
              </span>
            )}
          </button>

          {showColPanel && (
            <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-lg border bg-popover shadow-md p-2">
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="rounded"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
              <div className="border-t mt-2 pt-2">
                <button
                  onClick={resetCols}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurar por defecto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table — overflow-x-auto on the outer border container enables horizontal scroll
          while the rounded border still clips properly */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {/* Fixed: Title / Buyer */}
              <th
                className="px-4 py-2.5 text-left sticky left-0 bg-muted/50 z-10 min-w-[320px] whitespace-nowrap"
                style={{ boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}
              >
                Licitación / Contratante
              </th>

              {activeCols.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left"
                  )}
                  style={{ minWidth: col.width }}
                >
                  {col.sortField ? (
                    <PipelineSortHeader
                      label={col.label}
                      field={col.sortField}
                      currentSort={currentSort}
                      currentDir={currentDir}
                      className={col.align === "right" ? "justify-end" : ""}
                    />
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {tenders.map((tender) => {
              const deadline = daysUntil(tender.deadline_at);
              return (
                <tr
                  key={tender.id}
                  className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
                >
                  {/* Fixed: Title / Buyer / Link */}
                  <td
                    className="px-4 py-3 sticky left-0 bg-background hover:bg-muted/40 z-10 min-w-[320px]"
                    style={{ boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">
                          {tender.title ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {tender.buyer_name ?? "—"}
                        </p>
                      </div>
                      {tender.link && (
                        <a
                          href={tender.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
                          title="Ver licitación oficial"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>

                  {activeCols.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-3 text-xs text-muted-foreground whitespace-nowrap",
                        col.align === "right" && "text-right"
                      )}
                      style={{ minWidth: col.width }}
                    >
                      <CellValue col={col} tender={tender} deadline={deadline} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <PipelinePagination
          currentPage={currentPage}
          totalPages={totalPages}
          perPage={perPage}
        />
      )}
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

function CellValue({
  col,
  tender,
  deadline,
}: {
  col: ColDef;
  tender: TenderRow;
  deadline: ReturnType<typeof daysUntil>;
}) {
  switch (col.key) {
    case "cpv_codes": {
      const codes = tender.cpv_codes ?? [];
      if (codes.length === 0) return <span className="text-muted-foreground/50">—</span>;
      const labels = codes.map((c) => cpvLabelOnly(c) || c);
      const display = labels.join(" · ");
      return (
        <span className="block max-w-[230px] truncate" title={display}>
          {display}
        </span>
      );
    }

    case "status": {
      const s = tender.status;
      if (!s) return <span className="text-muted-foreground/50">—</span>;
      const info = PROCUREMENT_STATUS_LABELS[s];
      return (
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            info ? info.className : "bg-muted text-muted-foreground"
          )}
        >
          {info ? info.label : s}
        </span>
      );
    }

    case "region":
      return (
        <span>
          {nutsLabel(tender.region ?? "") || tender.region || "—"}
        </span>
      );

    case "created_at":
      return (
        <span className="font-mono">
          {tender.created_at ? tender.created_at.slice(0, 10) : "—"}
        </span>
      );

    case "deadline_at":
      return (
        <span
          className={cn(
            deadline.expired
              ? "text-destructive"
              : deadline.urgent
              ? "text-amber-600"
              : ""
          )}
        >
          {formatDate(tender.deadline_at)}
        </span>
      );

    case "contract_type":
      return tender.contract_type ? (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-muted font-medium">
          {CONTRACT_TYPE_LABELS[tender.contract_type] ?? tender.contract_type}
        </span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      );

    case "procedure_type":
      return (
        <span className="truncate block max-w-[120px]" title={tender.procedure_type ?? ""}>
          {tender.procedure_type ?? "—"}
        </span>
      );

    case "cpv":
      return (
        <span className="truncate block max-w-[150px]" title={tender.cpv ?? ""}>
          {cpvLabelOnly(tender.cpv ?? "") || tender.cpv || "—"}
        </span>
      );

    case "buyer_type":
      return (
        <span className="truncate block max-w-[120px]" title={tender.buyer_type ?? ""}>
          {tender.buyer_type ?? "—"}
        </span>
      );

    case "budget_amount":
      return (
        <span className="font-medium text-foreground">
          {formatBudget(tender.budget_amount)}
        </span>
      );

    case "lot_count":
      return <span>{tender.lot_count ?? "—"}</span>;

    case "duration_months":
      return (
        <span>
          {tender.duration_months != null ? `${tender.duration_months} m` : "—"}
        </span>
      );

    case "published_at":
      return <span>{formatDate(tender.published_at)}</span>;

    default:
      return null;
  }
}
