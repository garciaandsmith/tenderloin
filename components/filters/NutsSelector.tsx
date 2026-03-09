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

// All selectable leaf-level codes for "select all / clear all"
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

  const query = search.trim().toLowerCase();

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
            (s) =>
              s.label.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)
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
      const toAdd = codes.filter((c) => !selected.includes(c));
      onChange([...selected, ...toAdd]);
    }
  }

  function selectAll() {
    if (disabled) return;
    onChange(ALL_CODES);
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  const nationalEntry = SPAIN_NUTS_CODES.find((n) => n.code === "ES")!;

  return (
    <div className="space-y-4">
      {/* Search + bulk actions */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar región o código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-sm h-8"
          disabled={disabled}
        />
        {!disabled && (
          <div className="flex gap-1 ml-auto">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Seleccionar todas
            </button>
            <span className="text-muted-foreground text-xs">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Quitar todas
            </button>
          </div>
        )}
      </div>

      {/* Selection summary */}
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} {selected.length === 1 ? "región seleccionada" : "regiones seleccionadas"}
        </p>
      )}

      {/* National option */}
      {(!query || nationalEntry.label.toLowerCase().includes(query) || nationalEntry.code.toLowerCase().includes(query)) && (
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
      <div className="space-y-4">
        {visibleTree.map((group) => {
          const groupCodes = allCodesInGroup(group);
          const allIn = groupCodes.every((c) => selected.includes(c));
          const someIn = groupCodes.some((c) => selected.includes(c));

          return (
            <div key={group.code} className="space-y-1">
              {/* Group header */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                  <span className="font-normal ml-1 normal-case tracking-normal text-muted-foreground/60">
                    ({group.code})
                  </span>
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto"
                  >
                    {allIn ? "Quitar" : someIn ? "Completar" : "Todas"}
                  </button>
                )}
              </div>

              {/* NUTS-2 children */}
              <div className="pl-3 border-l border-border space-y-1">
                {group.children.map((child) => (
                  <div key={child.code}>
                    <CheckRow
                      code={child.code}
                      label={child.label}
                      checked={selected.includes(child.code)}
                      onToggle={() => toggle(child.code)}
                      disabled={disabled}
                    />
                    {/* NUTS-3 sub-entries */}
                    {child.sub && child.sub.length > 0 && (
                      <div className="pl-5 border-l border-border/50 ml-1 mt-0.5 space-y-0.5">
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
      className={`flex items-center gap-2 cursor-pointer group select-none py-0.5 ${
        disabled ? "cursor-default" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-primary h-3.5 w-3.5 rounded"
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
