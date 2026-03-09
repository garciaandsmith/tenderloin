"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { SPAIN_NUTS_CODES } from "@/lib/utils/nuts";

// ── Hierarchy definition ──────────────────────────────────────────────────────

type Nuts3Entry = { code: string; label: string };
type Nuts2Entry = { code: string; label: string; sub?: Nuts3Entry[] };
type Nuts1Group = { code: string; label: string; children: Nuts2Entry[] };

const NUTS_TREE: Nuts1Group[] = [
  {
    code: "ES1",
    label: "Noroeste",
    children: [
      { code: "ES11", label: "Galicia" },
      { code: "ES12", label: "Principado de Asturias" },
      { code: "ES13", label: "Cantabria" },
    ],
  },
  {
    code: "ES2",
    label: "Noreste",
    children: [
      { code: "ES21", label: "País Vasco" },
      { code: "ES22", label: "Comunidad Foral de Navarra" },
      { code: "ES23", label: "La Rioja" },
      { code: "ES24", label: "Aragón" },
    ],
  },
  {
    code: "ES3",
    label: "Comunidad de Madrid",
    children: [
      {
        code: "ES30",
        label: "Comunidad de Madrid",
        sub: [{ code: "ES300", label: "Madrid (provincia)" }],
      },
    ],
  },
  {
    code: "ES4",
    label: "Centro",
    children: [
      { code: "ES41", label: "Castilla y León" },
      { code: "ES42", label: "Castilla-La Mancha" },
      { code: "ES43", label: "Extremadura" },
    ],
  },
  {
    code: "ES5",
    label: "Este",
    children: [
      { code: "ES51", label: "Cataluña" },
      { code: "ES52", label: "Comunitat Valenciana" },
      { code: "ES53", label: "Illes Balears" },
    ],
  },
  {
    code: "ES6",
    label: "Sur",
    children: [
      { code: "ES61", label: "Andalucía" },
      { code: "ES62", label: "Región de Murcia" },
      { code: "ES63", label: "Ciudad de Ceuta" },
      { code: "ES64", label: "Ciudad de Melilla" },
    ],
  },
  {
    code: "ES7",
    label: "Canarias",
    children: [{ code: "ES70", label: "Canarias" }],
  },
];

const ALL_CODES = SPAIN_NUTS_CODES.map((n) => n.code);

function allCodesInGroup(group: Nuts1Group): string[] {
  const codes: string[] = [group.code];
  for (const c of group.children) {
    codes.push(c.code);
    if (c.sub) codes.push(...c.sub.map((s) => s.code));
  }
  return codes;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

export default function NutsSelector({ selected, onChange, disabled = false }: Props) {
  const [search, setSearch] = useState("");
  // Groups collapsed by default; expand on interaction or when searching
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NUTS_TREE.map((g) => [g.code, true]))
  );

  const query = search.trim().toLowerCase();
  // While searching, force-expand all groups so matches are visible
  const isSearching = query.length > 0;

  const visibleTree = useMemo(() => {
    if (!query) return NUTS_TREE;
    return NUTS_TREE.map((group) => {
      const groupMatches =
        group.label.toLowerCase().includes(query) || group.code.toLowerCase().includes(query);
      const filteredChildren = group.children
        .map((child) => {
          const childMatches =
            child.label.toLowerCase().includes(query) || child.code.toLowerCase().includes(query);
          const filteredSub = child.sub?.filter(
            (s) => s.label.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)
          );
          if (childMatches || (filteredSub && filteredSub.length > 0)) {
            return { ...child, sub: childMatches ? child.sub : filteredSub };
          }
          return null;
        })
        .filter(Boolean) as Nuts2Entry[];
      if (groupMatches || filteredChildren.length > 0) {
        return { ...group, children: groupMatches ? group.children : filteredChildren };
      }
      return null;
    }).filter(Boolean) as Nuts1Group[];
  }, [query]);

  function toggle(code: string) {
    if (disabled) return;
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function toggleGroup(group: Nuts1Group) {
    if (disabled) return;
    const codes = allCodesInGroup(group);
    const allIn = codes.every((c) => selected.includes(c));
    if (allIn) {
      onChange(selected.filter((c) => !codes.includes(c)));
    } else {
      onChange([...selected, ...codes.filter((c) => !selected.includes(c))]);
    }
  }

  function toggleCollapse(code: string) {
    setCollapsed((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function expandAll() {
    setCollapsed(Object.fromEntries(NUTS_TREE.map((g) => [g.code, false])));
  }

  function collapseAll() {
    setCollapsed(Object.fromEntries(NUTS_TREE.map((g) => [g.code, true])));
  }

  const nationalEntry = SPAIN_NUTS_CODES.find((n) => n.code === "ES")!;
  const nationalVisible =
    !query ||
    nationalEntry.label.toLowerCase().includes(query) ||
    nationalEntry.code.toLowerCase().includes(query);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Buscar región o código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-sm h-8"
          disabled={disabled}
        />
        <div className="flex gap-2 ml-auto items-center">
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => onChange(ALL_CODES)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Seleccionar todas
              </button>
              <span className="text-muted-foreground text-xs">·</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Quitar todas
              </button>
              <span className="text-muted-foreground text-xs">·</span>
            </>
          )}
          {!isSearching && (
            <>
              <button
                type="button"
                onClick={expandAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Expandir
              </button>
              <span className="text-muted-foreground text-xs">·</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Colapsar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selection count */}
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length}{" "}
          {selected.length === 1 ? "región seleccionada" : "regiones seleccionadas"}
        </p>
      )}

      {/* National option */}
      {nationalVisible && (
        <CheckRow
          code={nationalEntry.code}
          label={nationalEntry.label}
          checked={selected.includes(nationalEntry.code)}
          onToggle={() => toggle(nationalEntry.code)}
          disabled={disabled}
          bold
        />
      )}

      {/* Grouped tree */}
      <div className="space-y-1">
        {visibleTree.map((group) => {
          const groupCodes = allCodesInGroup(group);
          const allIn = groupCodes.every((c) => selected.includes(c));
          const someIn = !allIn && groupCodes.some((c) => selected.includes(c));
          const isOpen = isSearching || !collapsed[group.code];
          const selectedInGroup = groupCodes.filter((c) => selected.includes(c)).length;

          return (
            <div key={group.code} className="rounded-md border border-border overflow-hidden">
              {/* Collapsible group header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.code)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                  <ChevronIcon open={isOpen} />
                  <span className="text-xs font-semibold truncate">{group.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{group.code}</span>
                  {selectedInGroup > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
                      {selectedInGroup}
                    </span>
                  )}
                </button>

                {/* Select-all for group */}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroup(group);
                    }}
                    className={`text-xs underline underline-offset-2 whitespace-nowrap transition-colors ${
                      allIn
                        ? "text-primary hover:text-primary/70"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {allIn ? "Quitar" : someIn ? "Completar" : "Todas"}
                  </button>
                )}
              </div>

              {/* Children (collapsible) */}
              {isOpen && (
                <div className="px-3 py-2 space-y-1 border-t border-border/50">
                  {group.children.map((child) => (
                    <div key={child.code}>
                      <CheckRow
                        code={child.code}
                        label={child.label}
                        checked={selected.includes(child.code)}
                        onToggle={() => toggle(child.code)}
                        disabled={disabled}
                      />
                      {child.sub && child.sub.length > 0 && (
                        <div className="pl-5 border-l border-border/40 ml-1.5 mt-0.5 space-y-0.5">
                          {child.sub.map((sub) => (
                            <CheckRow
                              key={sub.code}
                              code={sub.code}
                              label={sub.label}
                              checked={selected.includes(sub.code)}
                              onToggle={() => toggle(sub.code)}
                              disabled={disabled}
                              muted
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleTree.length === 0 && query && (
        <p className="text-xs text-muted-foreground">Sin resultados para "{search}"</p>
      )}
    </div>
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
      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckRow({
  code,
  label,
  checked,
  onToggle,
  disabled,
  bold = false,
  muted = false,
}: {
  code: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 select-none py-0.5 ${
        disabled ? "cursor-default" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-primary h-3.5 w-3.5 rounded shrink-0"
      />
      <span
        className={`text-sm leading-tight ${
          muted ? "text-muted-foreground text-xs" : bold ? "font-medium" : ""
        } ${checked ? "text-foreground" : ""}`}
      >
        {label}
      </span>
      <span className="text-xs text-muted-foreground/50 font-mono">{code}</span>
    </label>
  );
}
