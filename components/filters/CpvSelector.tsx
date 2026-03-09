"use client";

import { useState, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { AGENCY_CPV_CODES } from "@/lib/utils/cpv";

const CATEGORIES = [...new Set(AGENCY_CPV_CODES.map((c) => c.category))];

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

export default function CpvSelector({ selected, onChange, disabled = false }: Props) {
  function labelFor(code: string): string {
    return AGENCY_CPV_CODES.find((c) => c.code === code)?.label ?? "Código personalizado";
  }

  function remove(code: string) {
    onChange(selected.filter((c) => c !== code));
  }

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground self-center">
            Ningún código seleccionado
          </span>
        ) : (
          selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-1 text-xs"
            >
              <span className="font-mono font-semibold">{code}</span>
              <span className="text-primary/70">{labelFor(code)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="hover:text-destructive transition-colors ml-0.5 leading-none"
                  aria-label={`Quitar ${code}`}
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {/* Action row */}
      {!disabled && (
        <div className="flex gap-2 items-center">
          <CpvPickerModal selected={selected} onChange={onChange} />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Quitar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal picker ──────────────────────────────────────────────────────────────

function CpvPickerModal({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();

  const filteredSuggested = useMemo(() => {
    if (!query) return AGENCY_CPV_CODES;
    return AGENCY_CPV_CODES.filter(
      (c) =>
        c.code.includes(query) ||
        c.label.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query)
    );
  }, [query]);

  const groupedSuggested = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: filteredSuggested.filter((c) => c.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [filteredSuggested]);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function addCustom() {
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

  function selectAllVisible() {
    const toAdd = filteredSuggested.map((c) => c.code).filter((c) => !selected.includes(c));
    onChange([...selected, ...toAdd]);
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      setSearch("");
      setCustomInput("");
      setCustomError(null);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          + Añadir códigos CPV
        </Button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <DialogHeader>
          <DialogTitle>Códigos CPV</DialogTitle>
          <DialogDescription>
            Busca y selecciona los códigos CPV relevantes para este proyecto.
          </DialogDescription>
        </DialogHeader>

        {/* Search + summary */}
        <div className="px-5 pt-4 pb-3 border-b border-border space-y-2">
          <Input
            ref={searchRef}
            placeholder="Buscar por código, descripción o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selected.length}{" "}
              {selected.length === 1 ? "código seleccionado" : "códigos seleccionados"}
            </span>
            {filteredSuggested.some((c) => !selected.includes(c.code)) && (
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Seleccionar todos los resultados
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-4">
          {groupedSuggested.length > 0 ? (
            groupedSuggested.map(({ category, items }) => (
              <div key={category}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {category}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const checked = selected.includes(item.code);
                    return (
                      <label
                        key={item.code}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item.code)}
                          className="accent-primary h-4 w-4 shrink-0"
                        />
                        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                          {item.code}
                        </span>
                        <span className="text-sm">{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin resultados para "{search}"
            </p>
          )}

          {/* Custom code */}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Código personalizado
            </p>
            <p className="text-xs text-muted-foreground">
              Introduce cualquier código CPV de 5–8 dígitos que no aparezca en la lista.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Ej. 79342000"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setCustomError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
                className="max-w-[180px] h-8 text-sm font-mono"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCustom}>
                Añadir
              </Button>
            </div>
            {customError && <p className="text-xs text-destructive">{customError}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <DialogClose asChild>
            <Button type="button" size="sm">
              Listo
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
