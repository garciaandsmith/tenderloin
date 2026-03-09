"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AGENCY_CPV_CODES } from "@/lib/utils/cpv";

const CATEGORIES = [...new Set(AGENCY_CPV_CODES.map((c) => c.category))];

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

export default function CpvSelector({ selected, onChange, disabled = false }: Props) {
  const [search, setSearch] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const query = search.trim().toLowerCase();

  // Codes from the suggested list that aren't selected yet
  const filteredSuggested = useMemo(() => {
    return AGENCY_CPV_CODES.filter((c) => {
      const matchesQuery =
        !query ||
        c.code.includes(query) ||
        c.label.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query);
      const notSelected = !selected.includes(c.code);
      return matchesQuery && notSelected;
    });
  }, [query, selected]);

  const groupedSuggested = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: filteredSuggested.filter((c) => c.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [filteredSuggested]);

  function toggle(code: string) {
    if (disabled) return;
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function addCustom() {
    if (disabled) return;
    const code = customInput.trim();
    setCustomError(null);
    if (!code) return;
    if (!/^\d{5,8}$/.test(code)) {
      setCustomError("El código CPV debe tener entre 5 y 8 dígitos.");
      return;
    }
    if (selected.includes(code)) {
      setCustomError("Este código ya está seleccionado.");
      return;
    }
    onChange([...selected, code]);
    setCustomInput("");
  }

  function selectAllSuggested() {
    if (disabled) return;
    const toAdd = AGENCY_CPV_CODES.map((c) => c.code).filter((c) => !selected.includes(c));
    onChange([...selected, ...toAdd]);
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  // Look up a label for a selected code (may not be in AGENCY_CPV_CODES if custom)
  function labelFor(code: string): string {
    const entry = AGENCY_CPV_CODES.find((c) => c.code === code);
    return entry ? entry.label : "Código personalizado";
  }

  return (
    <div className="space-y-5">
      {/* Selected codes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {selected.length === 0
              ? "Ningún código seleccionado"
              : `${selected.length} ${selected.length === 1 ? "código seleccionado" : "códigos seleccionados"}`}
          </span>
          {!disabled && selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Quitar todos
            </button>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-1 text-xs font-mono"
              >
                <span className="font-bold">{code}</span>
                <span className="text-primary/70 font-sans">{labelFor(code)}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggle(code)}
                    className="hover:text-destructive transition-colors ml-0.5 font-bold"
                    aria-label={`Quitar ${code}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Suggested codes — search + bulk actions */}
      {!disabled && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Buscar por código, descripción o categoría…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm h-8"
            />
            {filteredSuggested.length > 0 && (
              <button
                type="button"
                onClick={selectAllSuggested}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
              >
                Añadir todos
              </button>
            )}
          </div>

          {/* Grouped suggestions */}
          {groupedSuggested.length > 0 ? (
            <div className="space-y-3">
              {groupedSuggested.map(({ category, items }) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => toggle(item.code)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:border-primary hover:bg-primary/5 px-2 py-1 text-xs transition-colors text-left"
                      >
                        <span className="font-mono text-muted-foreground">{item.code}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {query
                ? `Sin sugerencias para "${search}"`
                : "Todos los códigos sugeridos ya están seleccionados."}
            </p>
          )}

          {/* Custom code input */}
          <div className="border-t pt-3 space-y-1">
            <p className="text-xs text-muted-foreground">Añadir código CPV personalizado</p>
            <div className="flex gap-2">
              <Input
                placeholder="Ej. 79342000"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setCustomError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
                className="max-w-[180px] text-sm h-8 font-mono"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCustom}>
                Añadir
              </Button>
            </div>
            {customError && <p className="text-xs text-destructive">{customError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
