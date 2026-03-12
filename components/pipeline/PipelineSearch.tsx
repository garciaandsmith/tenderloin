"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { SPAIN_NUTS_CODES } from "@/lib/utils/nuts";
import { CPV_FILTER_CATEGORIES } from "@/lib/utils/cpv";

interface Props {
  q?: string;
  contractType?: string;
  region?: string;
  cpv?: string;
  status?: string;
  budgetMin?: string;
  budgetMax?: string;
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
  contractType,
  region,
  cpv,
  status = "active",
  budgetMin,
  budgetMax,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(
    !!(contractType || region || cpv || budgetMin || budgetMax)
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

  const hasFilters = q || contractType || region || cpv || budgetMin || budgetMax || (status && status !== "active");

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
            showFilters || (hasFilters && hasFilters !== (status !== "active"))
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {(contractType || region || cpv || budgetMin || budgetMax) && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">
              {[contractType, region, cpv, budgetMin || budgetMax].filter(Boolean).length}
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
        </div>
      )}
    </div>
  );
}
