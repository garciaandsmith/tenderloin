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
import { AGENCY_CPV_CODES, type CpvEntry } from "@/lib/utils/cpv";

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CATEGORIES.map((cat) => [cat, true]))
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const filteredByCategory = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const items = AGENCY_CPV_CODES.filter((c) => c.category === cat);
      if (!query) return { category: cat, items };
      const filtered = items.filter(
        (c) =>
          c.code.includes(query) ||
          c.label.toLowerCase().includes(query) ||
          c.category.toLowerCase().includes(query)
      );
      return { category: cat, items: filtered };
    }).filter((g) => g.items.length > 0);
  }, [query]);

  const allFilteredItems = useMemo(
    () => filteredByCategory.flatMap((g) => g.items),
    [filteredByCategory]
  );

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function toggleCategory(cat: string) {
    const codes = AGENCY_CPV_CODES.filter((c) => c.category === cat).map((c) => c.code);
    const allIn = codes.every((c) => selected.includes(c));
    if (allIn) {
      onChange(selected.filter((c) => !codes.includes(c)));
    } else {
      onChange([...selected, ...codes.filter((c) => !selected.includes(c))]);
    }
  }

  function toggleCollapse(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function selectAllVisible() {
    const toAdd = allFilteredItems.map((c) => c.code).filter((c) => !selected.includes(c));
    onChange([...selected, ...toAdd]);
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

  function handleOpenChange(open: boolean) {
    if (open) {
      setSearch("");
      setCustomInput("");
      setCustomError(null);
      setCollapsed(Object.fromEntries(CATEGORIES.map((cat) => [cat, true])));
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
            Selecciona los códigos CPV relevantes para este proyecto.
          </DialogDescription>
        </DialogHeader>

        {/* Search + global actions */}
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
            {allFilteredItems.some((c) => !selected.includes(c.code)) && (
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {isSearching ? "Seleccionar todos los resultados" : "Seleccionar todos"}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable category list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
          {filteredByCategory.length > 0 ? (
            filteredByCategory.map(({ category, items }) => {
              const allCodes = AGENCY_CPV_CODES.filter((c) => c.category === category).map(
                (c) => c.code
              );
              const selectedInCat = allCodes.filter((c) => selected.includes(c)).length;
              const allIn = selectedInCat === allCodes.length;
              const someIn = selectedInCat > 0 && !allIn;
              const isOpen = isSearching || !collapsed[category];

              return (
                <div key={category} className="rounded-md border border-border overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(category)}
                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                    >
                      <ChevronIcon open={isOpen} />
                      <span className="text-xs font-semibold truncate">{category}</span>
                      <span
                        className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums shrink-0 ${
                          selectedInCat > 0
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {selectedInCat}/{items.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(category);
                      }}
                      className={`text-xs underline underline-offset-2 whitespace-nowrap transition-colors shrink-0 ${
                        allIn
                          ? "text-primary hover:text-primary/70"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {allIn ? "Quitar" : someIn ? "Completar" : "Todas"}
                    </button>
                  </div>

                  {/* Items grid */}
                  {isOpen && (
                    <div className="grid grid-cols-2 gap-0.5 px-3 py-2 border-t border-border/50">
                      {items.map((item) => (
                        <CpvCheckRow
                          key={item.code}
                          item={item}
                          checked={selected.includes(item.code)}
                          onToggle={() => toggle(item.code)}
                          highlight={query}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin resultados para «{search}»
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
              {selected.length > 0 && (
                <span className="ml-1.5 text-xs opacity-70">· {selected.length}</span>
              )}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CpvCheckRow({
  item,
  checked,
  onToggle,
  highlight,
}: {
  item: CpvEntry;
  checked: boolean;
  onToggle: () => void;
  highlight: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="accent-primary h-4 w-4 shrink-0 mt-0.5"
      />
      <span className="min-w-0">
        <span className="font-mono text-xs text-muted-foreground block">
          <Highlight text={item.code} query={highlight} />
        </span>
        <span className="text-xs leading-tight line-clamp-2">
          <Highlight text={item.label} query={highlight} />
        </span>
      </span>
    </label>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded-[2px] px-0.5 not-italic font-inherit">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
