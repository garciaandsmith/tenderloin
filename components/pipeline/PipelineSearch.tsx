"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Search, X } from "lucide-react";

interface Props {
  q?: string;
  contractType?: string;
  region?: string;
}

const CONTRACT_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "services", label: "Servicios" },
  { value: "supplies", label: "Suministros" },
  { value: "works", label: "Obras" },
  { value: "concession", label: "Concesión" },
];

export default function PipelineSearch({ q, contractType, region }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const updateSearch = useCallback(
    (updates: Partial<{ q: string; contract_type: string; region: string }>) => {
      const params = new URLSearchParams();
      const newQ = "q" in updates ? updates.q : q;
      const newContractType = "contract_type" in updates ? updates.contract_type : contractType;
      const newRegion = "region" in updates ? updates.region : region;

      if (newQ) params.set("q", newQ);
      if (newContractType) params.set("contract_type", newContractType);
      if (newRegion) params.set("region", newRegion);

      const search = params.toString();
      router.push(`${pathname}${search ? `?${search}` : ""}`);
    },
    [q, contractType, region, router, pathname]
  );

  const hasFilters = q || contractType || region;

  return (
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

      {/* Contract type filter */}
      <select
        value={contractType ?? ""}
        onChange={(e) => updateSearch({ contract_type: e.target.value })}
        className="px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {CONTRACT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md transition-colors"
        >
          <X className="h-4 w-4" />
          Limpiar
        </button>
      )}
    </div>
  );
}
