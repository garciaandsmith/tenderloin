"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface CpvRawEntry {
  c: string; // 8-digit code
  l: string; // label/description
  k: string; // category
  t: string; // type (Suministros / Servicios / Obras)
}

interface CpvEntry {
  code: string;
  label: string;
  category: string;
  type: string;
  group: string; // first 3 digits
}

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

// ── Data loading ───────────────────────────────────────────────────────────────

let _cachedData: CpvEntry[] | null = null;

async function loadCpvData(): Promise<CpvEntry[]> {
  if (_cachedData) return _cachedData;
  const res = await fetch("/cpv-data.json");
  const raw: CpvRawEntry[] = await res.json();
  _cachedData = raw.map((r) => ({
    code: r.c,
    label: r.l,
    category: r.k,
    type: r.t,
    group: r.c.slice(0, 3),
  }));
  return _cachedData;
}

// ── Label lookup (uses original curated list as fallback for display) ──────────

import { AGENCY_CPV_CODES } from "@/lib/utils/cpv";

function labelFor(code: string, allCodes: CpvEntry[]): string {
  const entry = allCodes.find((e) => e.code === code);
  if (entry) return entry.label;
  const curated = AGENCY_CPV_CODES.find((c) => c.code === code);
  return curated?.label ?? "Código personalizado";
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CpvSelector({ selected, onChange, disabled = false }: Props) {
  function remove(code: string) {
    onChange(selected.filter((c) => c !== code));
  }

  // We need allCodes for label display – load them on mount
  const [allCodes, setAllCodes] = useState<CpvEntry[]>([]);
  useEffect(() => {
    loadCpvData().then(setAllCodes);
  }, []);

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground self-center">
            Ningún código seleccionado — se mostrarán todos los contratos sin filtrar por CPV
          </span>
        ) : (
          selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-1 text-xs"
            >
              <span className="font-mono font-semibold">{code}</span>
              <span className="text-primary/70 max-w-[180px] truncate">
                {labelFor(code, allCodes)}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="hover:text-destructive transition-colors ml-0.5 leading-none shrink-0"
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

// ── Modal picker ───────────────────────────────────────────────────────────────

function CpvPickerModal({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [allCodes, setAllCodes] = useState<CpvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load data on first open
  useEffect(() => {
    if (open && allCodes.length === 0) {
      setLoading(true);
      loadCpvData().then((data) => {
        setAllCodes(data);
        setLoading(false);
        // Default to first category
        const cats = [...new Set(data.map((d) => d.category))].sort();
        if (cats.length > 0) setActiveCategory(cats[0]);
      });
    }
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, allCodes.length]);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setSearch("");
      setCustomInput("");
      setCustomError(null);
    }
  }

  // Sorted unique categories
  const categories = useMemo(
    () => [...new Set(allCodes.map((d) => d.category))].sort(),
    [allCodes]
  );

  // Search results (cross-category, limited to 200)
  const query = search.trim().toLowerCase();
  const isSearching = query.length >= 2;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return allCodes
      .filter(
        (e) =>
          e.code.includes(query) ||
          e.label.toLowerCase().includes(query) ||
          e.category.toLowerCase().includes(query)
      )
      .slice(0, 200);
  }, [allCodes, query, isSearching]);

  // Codes for active category, grouped by 3-digit prefix
  const categoryGroups = useMemo(() => {
    if (!activeCategory || isSearching) return [];
    const codesInCat = allCodes.filter((e) => e.category === activeCategory);
    const groupMap = new Map<string, CpvEntry[]>();
    for (const entry of codesInCat) {
      const g = groupMap.get(entry.group) ?? [];
      g.push(entry);
      groupMap.set(entry.group, g);
    }
    // Sort groups by code
    return [...groupMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, codes]) => ({
        group,
        label: codes.find((c) => c.code.endsWith("00000") || c.code.endsWith("0000"))?.label ?? codes[0].label,
        codes: codes.sort((a, b) => a.code.localeCompare(b.code)),
      }));
  }, [allCodes, activeCategory, isSearching]);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function toggleGroup(codes: CpvEntry[]) {
    const groupCodes = codes.map((c) => c.code);
    const allIn = groupCodes.every((c) => selected.includes(c));
    if (allIn) {
      onChange(selected.filter((c) => !groupCodes.includes(c)));
    } else {
      onChange([...selected, ...groupCodes.filter((c) => !selected.includes(c))]);
    }
  }

  function toggleCategory(cat: string) {
    const catCodes = allCodes.filter((e) => e.category === cat).map((e) => e.code);
    const allIn = catCodes.every((c) => selected.includes(c));
    if (allIn) {
      onChange(selected.filter((c) => !catCodes.includes(c)));
    } else {
      onChange([...selected, ...catCodes.filter((c) => !selected.includes(c))]);
    }
  }

  function selectAllSearchResults() {
    const toAdd = searchResults.map((e) => e.code).filter((c) => !selected.includes(c));
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

  const selectedInCategory = useCallback(
    (cat: string) => allCodes.filter((e) => e.category === cat && selected.includes(e.code)).length,
    [allCodes, selected]
  );

  const totalInCategory = useCallback(
    (cat: string) => allCodes.filter((e) => e.category === cat).length,
    [allCodes]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          + Gestionar códigos CPV
        </Button>
      </DialogTrigger>

      <DialogContent
        className="w-full max-w-4xl flex flex-col p-0 gap-0"
        style={{ maxHeight: "90vh" }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle>Selección de códigos CPV</DialogTitle>
          <DialogDescription>
            Navega por categoría o busca códigos por descripción. Los contratos se filtrarán por los
            códigos seleccionados.
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-border shrink-0 space-y-2">
          <Input
            ref={searchRef}
            placeholder="Buscar por código o descripción (mín. 2 caracteres)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{selected.length}</span>{" "}
              {selected.length === 1 ? "código seleccionado" : "códigos seleccionados"}
            </span>
            {isSearching && searchResults.length > 0 && (
              <button
                type="button"
                onClick={selectAllSearchResults}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Seleccionar los {searchResults.length} resultados
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            Cargando base de datos CPV…
          </div>
        ) : isSearching ? (
          /* ── Search results ── */
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin resultados para «{search}»
              </p>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map((entry) => (
                  <SearchResultRow
                    key={entry.code}
                    entry={entry}
                    checked={selected.includes(entry.code)}
                    onToggle={() => toggle(entry.code)}
                    query={query}
                  />
                ))}
                {searchResults.length === 200 && (
                  <p className="text-xs text-muted-foreground text-center pt-3">
                    Mostrando los primeros 200 resultados. Refina la búsqueda para ver más.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── Browse mode: two-panel layout ── */
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left panel: categories */}
            <div className="w-56 shrink-0 border-r border-border overflow-y-auto py-2">
              {categories.map((cat) => {
                const selCount = selectedInCategory(cat);
                const totalCount = totalInCategory(cat);
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                  >
                    <span className="truncate leading-snug">{cat}</span>
                    {selCount > 0 ? (
                      <span className="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary tabular-nums">
                        {selCount}/{totalCount}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {totalCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right panel: groups + codes */}
            <div className="flex-1 min-w-0 overflow-y-auto py-2 px-3">
              {activeCategory && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-semibold text-foreground">{activeCategory}</h3>
                  <button
                    type="button"
                    onClick={() => toggleCategory(activeCategory)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    {allCodes
                      .filter((e) => e.category === activeCategory)
                      .every((e) => selected.includes(e.code))
                      ? "Quitar todos"
                      : "Seleccionar todos"}
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {categoryGroups.map(({ group, label, codes }) => {
                  const groupCodes = codes.map((c) => c.code);
                  const selInGroup = groupCodes.filter((c) => selected.includes(c)).length;
                  const allIn = selInGroup === groupCodes.length;
                  const someIn = selInGroup > 0 && !allIn;
                  return (
                    <GroupSection
                      key={group}
                      group={group}
                      label={label}
                      codes={codes}
                      selected={selected}
                      selInGroup={selInGroup}
                      allIn={allIn}
                      someIn={someIn}
                      onToggle={toggle}
                      onToggleGroup={() => toggleGroup(codes)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Custom code + footer */}
        <div className="shrink-0 border-t border-border px-5 py-3 space-y-3">
          <div className="flex items-end gap-3">
            <div className="space-y-1 flex-1 max-w-xs">
              <p className="text-xs text-muted-foreground">
                Código personalizado (5–8 dígitos)
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
                  className="h-8 text-sm font-mono max-w-[160px]"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustom}>
                  Añadir
                </Button>
              </div>
              {customError && <p className="text-xs text-destructive">{customError}</p>}
            </div>
            <DialogClose asChild>
              <Button type="button" size="sm" className="ml-auto">
                Listo
                {selected.length > 0 && (
                  <span className="ml-1.5 text-xs opacity-70">· {selected.length}</span>
                )}
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── GroupSection ───────────────────────────────────────────────────────────────

function GroupSection({
  group,
  label,
  codes,
  selected,
  selInGroup,
  allIn,
  someIn,
  onToggle,
  onToggleGroup,
}: {
  group: string;
  label: string;
  codes: CpvEntry[];
  selected: string[];
  selInGroup: number;
  allIn: boolean;
  someIn: boolean;
  onToggle: (code: string) => void;
  onToggleGroup: () => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          <ChevronIcon open={!collapsed} />
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{group}xxx</span>
          <span className="text-xs font-medium truncate">{label}</span>
          <span
            className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums shrink-0 ${
              selInGroup > 0
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {selInGroup}/{codes.length}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleGroup();
          }}
          className={`text-[11px] underline underline-offset-2 whitespace-nowrap shrink-0 transition-colors ${
            allIn
              ? "text-primary hover:text-primary/70"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {allIn ? "Quitar" : someIn ? "Completar" : "Todos"}
        </button>
      </div>

      {/* Codes grid */}
      {!collapsed && (
        <div className="grid grid-cols-1 gap-0 px-2 py-1.5 border-t border-border/50">
          {codes.map((entry) => (
            <label
              key={entry.code}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
            >
              <input
                type="checkbox"
                checked={selected.includes(entry.code)}
                onChange={() => onToggle(entry.code)}
                className="accent-primary h-4 w-4 shrink-0 mt-0.5"
              />
              <span className="min-w-0">
                <span className="font-mono text-[11px] text-muted-foreground">{entry.code}</span>
                <span className="text-xs leading-snug ml-1.5">{entry.label}</span>
                {entry.type !== "Servicios" && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground italic">
                    ({entry.type})
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SearchResultRow ────────────────────────────────────────────────────────────

function SearchResultRow({
  entry,
  checked,
  onToggle,
  query,
}: {
  entry: CpvEntry;
  checked: boolean;
  onToggle: () => void;
  query: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="accent-primary h-4 w-4 shrink-0 mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[11px] text-muted-foreground">
          <Highlight text={entry.code} query={query} />
        </span>
        <span className="text-xs leading-snug ml-1.5">
          <Highlight text={entry.label} query={query} />
        </span>
        <span className="block text-[10px] text-muted-foreground mt-0.5">
          {entry.category} · {entry.type}
        </span>
      </span>
    </label>
  );
}

// ── Highlight ──────────────────────────────────────────────────────────────────

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

// ── ChevronIcon ────────────────────────────────────────────────────────────────

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
