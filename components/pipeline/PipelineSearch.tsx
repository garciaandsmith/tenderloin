"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { SPAIN_NUTS_CODES } from "@/lib/utils/nuts";
import { CPV_FILTER_CATEGORIES } from "@/lib/utils/cpv";

interface Props {
  q?: string;
  source?: string;
  contractType?: string;
  procedureType?: string;
  buyerType?: string;
  region?: string;
  cpv?: string;
  status?: string;
  budgetMin?: string;
  budgetMax?: string;
  lotCountMin?: string;
  lotCountMax?: string;
  durationMin?: string;
  durationMax?: string;
  publishedFrom?: string;
  publishedTo?: string;
  perPage?: number;
}

const CONTRACT_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "services", label: "Servicios" },
  { value: "supplies", label: "Suministros" },
  { value: "works", label: "Obras" },
  { value: "concession", label: "Concesión" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Vencidas" },
  { value: "all", label: "Todas" },
];

export default function PipelineSearch({
  q,
  source,
  contractType,
  procedureType,
  buyerType,
  region,
  cpv,
  status = "active",
  budgetMin,
  budgetMax,
  lotCountMin,
  lotCountMax,
  durationMin,
  durationMax,
  publishedFrom,
  publishedTo,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(
    !!(contractType || region || cpv || budgetMin || budgetMax || source || procedureType || buyerType || lotCountMin || lotCountMax || durationMin || durationMax || publishedFrom || publishedTo)
  );

  const updateSearch = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (val) {
          params.set(key, val);
        } else {
          params.delete(key);
        }
      });
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const activeFilterCount = [
    contractType,
    region,
    cpv,
    budgetMin || budgetMax,
    source,
    procedureType,
    buyerType,
    lotCountMin || lotCountMax,
    durationMin || durationMax,
    publishedFrom || publishedTo,
  ].filter(Boolean).length;

  const hasFilters =
    q ||
    contractType ||
    region ||
    cpv ||
    budgetMin ||
    budgetMax ||
    source ||
    procedureType ||
    buyerType ||
    lotCountMin ||
    lotCountMax ||
    durationMin ||
    durationMax ||
    publishedFrom ||
    publishedTo ||
    (status && status !== "active");

  return (
    <div className="space-y-3">
      {/* Top row: search + status + toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por título o contratante…"
            defaultValue={q ?? ""}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateSearch({ q: (e.target as HTMLInputElement).value });
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== (q ?? "")) {
                updateSearch({ q: e.target.value });
              }
            }}
          />
        </div>

        {/* Status toggle */}
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateSearch({ status: opt.value })}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                status === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Toggle filters button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-md transition-colors shrink-0 ${
            showFilters || activeFilterCount > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear all filters */}
        {hasFilters && (
          <button
            onClick={() => router.push(pathname)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
            Limpiar
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30">
          {/* Contract type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tipo de contrato
            </label>
            <select
              value={contractType ?? ""}
              onChange={(e) => updateSearch({ contract_type: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Region */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Región
            </label>
            <select
              value={region ?? ""}
              onChange={(e) => updateSearch({ region: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas las regiones</option>
              <optgroup label="Nacional">
                <option value="ES">España (todo el territorio)</option>
              </optgroup>
              <optgroup label="Comunidades autónomas (NUTS-2)">
                {SPAIN_NUTS_CODES.filter((n) => n.code.length === 4).map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Provincias (NUTS-3)">
                {SPAIN_NUTS_CODES.filter((n) => n.code.length === 5).map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* CPV category */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Categoría CPV
            </label>
            <select
              value={cpv ?? ""}
              onChange={(e) => updateSearch({ cpv: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos los CPV</option>
              {CPV_FILTER_CATEGORIES.map((cat) => (
                <option key={cat.prefix} value={cat.prefix}>
                  {cat.prefix}xx — {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Budget range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Presupuesto (€)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mín."
                defaultValue={budgetMin ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ budget_min: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ budget_min: (e.target as HTMLInputElement).value });
                  }
                }}
              />
              <input
                type="number"
                placeholder="Máx."
                defaultValue={budgetMax ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ budget_max: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ budget_max: (e.target as HTMLInputElement).value });
                  }
                }}
              />
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Fuente
            </label>
            <input
              type="text"
              placeholder="Ej. PLACSP"
              defaultValue={source ?? ""}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              onBlur={(e) => updateSearch({ source: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateSearch({ source: (e.target as HTMLInputElement).value });
                }
              }}
            />
          </div>

          {/* Procedure type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Procedimiento
            </label>
            <input
              type="text"
              placeholder="Ej. abierto"
              defaultValue={procedureType ?? ""}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              onBlur={(e) => updateSearch({ procedure_type: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateSearch({ procedure_type: (e.target as HTMLInputElement).value });
                }
              }}
            />
          </div>

          {/* Buyer type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tipo organismo
            </label>
            <input
              type="text"
              placeholder="Ej. ayuntamiento"
              defaultValue={buyerType ?? ""}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              onBlur={(e) => updateSearch({ buyer_type: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateSearch({ buyer_type: (e.target as HTMLInputElement).value });
                }
              }}
            />
          </div>

          {/* Lot count range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Lotes
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mín."
                defaultValue={lotCountMin ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ lot_count_min: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ lot_count_min: (e.target as HTMLInputElement).value });
                  }
                }}
              />
              <input
                type="number"
                placeholder="Máx."
                defaultValue={lotCountMax ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ lot_count_max: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ lot_count_max: (e.target as HTMLInputElement).value });
                  }
                }}
              />
            </div>
          </div>

          {/* Duration range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Duración (meses)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Mín."
                defaultValue={durationMin ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ duration_min: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ duration_min: (e.target as HTMLInputElement).value });
                  }
                }}
              />
              <input
                type="number"
                placeholder="Máx."
                defaultValue={durationMax ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ duration_max: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSearch({ duration_max: (e.target as HTMLInputElement).value });
                  }
                }}
              />
            </div>
          </div>

          {/* Published date range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Publicado (rango)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                defaultValue={publishedFrom ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ published_from: e.target.value })}
                onChange={(e) => updateSearch({ published_from: e.target.value })}
              />
              <input
                type="date"
                defaultValue={publishedTo ?? ""}
                className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onBlur={(e) => updateSearch({ published_to: e.target.value })}
                onChange={(e) => updateSearch({ published_to: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
