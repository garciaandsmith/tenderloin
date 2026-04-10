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
  { value: "", label: "All types" },
  { value: "services", label: "Services" },
  { value: "supplies", label: "Supplies" },
  { value: "works", label: "Works" },
  { value: "concession", label: "Concession" },
];

const PROCEDURE_TYPES = [
  { value: "", label: "All procedures" },
  { value: "open", label: "Open" },
  { value: "restricted", label: "Restricted" },
  { value: "negotiated", label: "Negotiated" },
  { value: "competitive_dialogue", label: "Competitive Dialogue" },
  { value: "simplified", label: "Simplified" },
];

const SOURCES = [
  { value: "", label: "All sources" },
  { value: "placsp", label: "PLACSP" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Expired" },
  { value: "all", label: "All" },
];

export default function IngestionSearch({
  q,
  source,
  contractType,
  procedureType,
  buyerType,
  region,
  cpv,
  status = "all",
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

  const hasAdvancedFilters = !!(
    contractType ||
    procedureType ||
    buyerType ||
    region ||
    cpv ||
    budgetMin ||
    budgetMax ||
    lotCountMin ||
    lotCountMax ||
    durationMin ||
    durationMax ||
    publishedFrom ||
    publishedTo ||
    source
  );

  const [showFilters, setShowFilters] = useState(hasAdvancedFilters);

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

  const hasAnyFilters =
    q ||
    hasAdvancedFilters ||
    (status && status !== "all");

  const activeFilterCount = [
    source,
    contractType,
    procedureType,
    buyerType,
    region,
    cpv,
    budgetMin || budgetMax,
    lotCountMin || lotCountMax,
    durationMin || durationMax,
    publishedFrom || publishedTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Top row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search title, buyer, external ID, summary…"
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

        {/* Toggle filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-md transition-colors shrink-0 ${
            showFilters || hasAdvancedFilters
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear */}
        {hasAnyFilters && (
          <button
            onClick={() => router.push(pathname)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {showFilters && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          {/* Row A: Standard filters */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Contract
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Contract type */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Contract type
                </label>
                <select
                  value={contractType ?? ""}
                  onChange={(e) =>
                    updateSearch({ contract_type: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Procedure type */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Procedure type
                </label>
                <select
                  value={procedureType ?? ""}
                  onChange={(e) =>
                    updateSearch({ procedure_type: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PROCEDURE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Region
                </label>
                <select
                  value={region ?? ""}
                  onChange={(e) => updateSearch({ region: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All regions</option>
                  <optgroup label="National">
                    <option value="ES">Spain (all territory)</option>
                  </optgroup>
                  <optgroup label="Autonomous communities (NUTS-2)">
                    {SPAIN_NUTS_CODES.filter((n) => n.code.length === 4).map(
                      (n) => (
                        <option key={n.code} value={n.code}>
                          {n.label}
                        </option>
                      )
                    )}
                  </optgroup>
                  <optgroup label="Provinces (NUTS-3)">
                    {SPAIN_NUTS_CODES.filter((n) => n.code.length === 5).map(
                      (n) => (
                        <option key={n.code} value={n.code}>
                          {n.label}
                        </option>
                      )
                    )}
                  </optgroup>
                </select>
              </div>

              {/* CPV */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  CPV category
                </label>
                <select
                  value={cpv ?? ""}
                  onChange={(e) => updateSearch({ cpv: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All CPV</option>
                  {CPV_FILTER_CATEGORIES.map((cat) => (
                    <option key={cat.prefix} value={cat.prefix}>
                      {cat.prefix}xx — {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row B: Ingestion-specific */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Buyer &amp; Source
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Source */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Source
                </label>
                <select
                  value={source ?? ""}
                  onChange={(e) => updateSearch({ source: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buyer type */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Buyer type
                </label>
                <input
                  type="text"
                  placeholder="e.g. municipality"
                  defaultValue={buyerType ?? ""}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  onBlur={(e) =>
                    updateSearch({ buyer_type: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      updateSearch({
                        buyer_type: (e.target as HTMLInputElement).value,
                      });
                  }}
                />
              </div>

              {/* Lot count range */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Lot count
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    defaultValue={lotCountMin ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ lot_count_min: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          lot_count_min: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    defaultValue={lotCountMax ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ lot_count_max: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          lot_count_max: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                </div>
              </div>

              {/* Budget range */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Budget (€)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    defaultValue={budgetMin ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ budget_min: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          budget_min: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    defaultValue={budgetMax ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ budget_max: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          budget_max: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row C: Date & duration */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Dates &amp; Duration
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Published from */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Published from
                </label>
                <input
                  type="date"
                  defaultValue={publishedFrom ?? ""}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  onChange={(e) =>
                    updateSearch({ published_from: e.target.value })
                  }
                />
              </div>

              {/* Published to */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Published to
                </label>
                <input
                  type="date"
                  defaultValue={publishedTo ?? ""}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  onChange={(e) =>
                    updateSearch({ published_to: e.target.value })
                  }
                />
              </div>

              {/* Duration months range */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Duration (months)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min="0"
                    defaultValue={durationMin ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ duration_min: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          duration_min: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    min="0"
                    defaultValue={durationMax ?? ""}
                    className="w-full px-2 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      updateSearch({ duration_max: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        updateSearch({
                          duration_max: (e.target as HTMLInputElement).value,
                        });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
