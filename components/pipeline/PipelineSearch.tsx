"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { SPAIN_NUTS_CODES } from "@/lib/utils/nuts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueryRule {
  id: string;
  field: string;
  op: string;
  value: string;
}

type FieldType = "text" | "select" | "number" | "date";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
}

// ─── Field definitions ────────────────────────────────────────────────────────

const CONTRACT_TYPE_OPTIONS = [
  { value: "services", label: "Servicios" },
  { value: "supplies", label: "Suministros" },
  { value: "works", label: "Obras" },
  { value: "concession", label: "Concesión" },
];

const STATUS_OPTIONS = [
  { value: "PUB", label: "Publicado" },
  { value: "ADJ", label: "Adjudicado" },
  { value: "FOR", label: "Formalizado" },
  { value: "EV", label: "En evaluación" },
  { value: "AN", label: "Anunciado" },
];

const REGION_OPTIONS = SPAIN_NUTS_CODES.map((n) => ({ value: n.code, label: n.label }));

const QUERY_FIELDS: FieldDef[] = [
  { key: "title", label: "Título", type: "text" },
  { key: "buyer_name", label: "Contratante", type: "text" },
  { key: "contract_type", label: "Tipo de contrato", type: "select", options: CONTRACT_TYPE_OPTIONS },
  { key: "status", label: "Estado", type: "select", options: STATUS_OPTIONS },
  { key: "cpv", label: "CPV (prefijo)", type: "text" },
  { key: "region", label: "Región", type: "select", options: REGION_OPTIONS },
  { key: "budget_amount", label: "Presupuesto (€)", type: "number" },
  { key: "published_at", label: "Fecha publicación", type: "date" },
  { key: "deadline_at", label: "Plazo", type: "date" },
  { key: "procedure_type", label: "Procedimiento", type: "text" },
  { key: "buyer_type", label: "Tipo organismo", type: "text" },
];

// ─── Operators ────────────────────────────────────────────────────────────────

const TEXT_OPS = [
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "is", label: "es exactamente" },
  { value: "is_not", label: "no es" },
  { value: "starts_with", label: "empieza por" },
];

const SELECT_OPS = [
  { value: "is", label: "es" },
  { value: "is_not", label: "no es" },
];

const NUMBER_OPS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
];

const DATE_OPS = [
  { value: "eq", label: "es" },
  { value: "gt", label: "después de" },
  { value: "lt", label: "antes de" },
  { value: "gte", label: "en o después de" },
  { value: "lte", label: "en o antes de" },
];

function opsForField(field: FieldDef) {
  switch (field.type) {
    case "text": return TEXT_OPS;
    case "select": return SELECT_OPS;
    case "number": return NUMBER_OPS;
    case "date": return DATE_OPS;
  }
}

function defaultOpForField(field: FieldDef) {
  return opsForField(field)[0].value;
}

// ─── Status filter options ────────────────────────────────────────────────────

const DEADLINE_STATUS_OPTIONS = [
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Vencidas" },
  { value: "all", label: "Todas" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

let ruleIdCounter = 0;
function nextRuleId() {
  return `r${++ruleIdCounter}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  filtersJson?: string;
  logic?: string;
  statusFilter?: string;
  perPage?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineSearch({
  filtersJson,
  logic: logicProp = "AND",
  statusFilter = "active",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse initial rules from URL
  function parseRules(): QueryRule[] {
    if (!filtersJson) return [];
    try {
      const parsed = JSON.parse(filtersJson);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is QueryRule =>
          r && typeof r.field === "string" && typeof r.op === "string" && typeof r.value === "string"
      ).map((r) => ({ ...r, id: nextRuleId() }));
    } catch {
      return [];
    }
  }

  const [rules, setRules] = useState<QueryRule[]>(parseRules);
  const [logic, setLogic] = useState<"AND" | "OR">(logicProp === "OR" ? "OR" : "AND");

  const applyFilters = useCallback(
    (newRules: QueryRule[], newLogic: "AND" | "OR", newStatusFilter: string) => {
      const params = new URLSearchParams(searchParams.toString());

      // Preserve sort/pagination params, clear filter-specific ones
      params.delete("filters");
      params.delete("logic");
      params.delete("status_filter");
      params.set("page", "1");

      if (newRules.length > 0) {
        const serializable = newRules.map(({ field, op, value }) => ({ field, op, value }));
        params.set("filters", JSON.stringify(serializable));
        if (newLogic === "OR") params.set("logic", "OR");
      }

      params.set("status_filter", newStatusFilter);
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  function addRule() {
    const firstField = QUERY_FIELDS[0];
    const newRule: QueryRule = {
      id: nextRuleId(),
      field: firstField.key,
      op: defaultOpForField(firstField),
      value: "",
    };
    setRules((prev) => [...prev, newRule]);
    // Don't apply yet — user hasn't entered a value
  }

  function removeRule(id: string) {
    const next = rules.filter((r) => r.id !== id);
    setRules(next);
    applyFilters(next, logic, statusFilter);
  }

  function updateRule(id: string, patch: Partial<QueryRule>) {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        // Reset op when field changes
        if (patch.field && patch.field !== r.field) {
          const fieldDef = QUERY_FIELDS.find((f) => f.key === patch.field)!;
          updated.op = defaultOpForField(fieldDef);
          updated.value = "";
        }
        return updated;
      })
    );
  }

  function commitRule(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (!rule || !rule.value.trim()) return;
    applyFilters(rules, logic, statusFilter);
  }

  function toggleLogic() {
    const next: "AND" | "OR" = logic === "AND" ? "OR" : "AND";
    setLogic(next);
    if (rules.some((r) => r.value.trim())) {
      applyFilters(rules, next, statusFilter);
    }
  }

  function changeStatusFilter(val: string) {
    applyFilters(rules, logic, val);
  }

  function clearAll() {
    setRules([]);
    router.push(`${pathname}?status_filter=${statusFilter}`);
  }

  const hasActiveFilters = rules.some((r) => r.value.trim());

  return (
    <div className="space-y-3">
      {/* Top row: deadline status toggle + clear */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {DEADLINE_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => changeStatusFilter(opt.value)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Rules */}
      {rules.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          {rules.map((rule, idx) => {
            const fieldDef = QUERY_FIELDS.find((f) => f.key === rule.field) ?? QUERY_FIELDS[0];
            const ops = opsForField(fieldDef);

            return (
              <div key={rule.id} className="space-y-1.5">
                {/* AND / OR badge between rules */}
                {idx > 0 && (
                  <div className="flex items-center gap-2 py-0.5">
                    <div className="flex-1 h-px bg-border" />
                    <button
                      onClick={toggleLogic}
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-background hover:bg-muted transition-colors"
                    >
                      {logic}
                    </button>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* Rule row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Field selector */}
                  <select
                    value={rule.field}
                    onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[150px]"
                  >
                    {QUERY_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  <select
                    value={rule.op}
                    onChange={(e) => updateRule(rule.id, { op: e.target.value })}
                    className="px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[130px]"
                  >
                    {ops.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Value input */}
                  <ValueInput
                    fieldDef={fieldDef}
                    value={rule.value}
                    onChange={(val) => updateRule(rule.id, { value: val })}
                    onCommit={() => commitRule(rule.id)}
                  />

                  {/* Remove rule */}
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                    title="Eliminar condición"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add condition button */}
      <button
        onClick={addRule}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-dashed rounded-md text-muted-foreground hover:text-foreground hover:bg-muted hover:border-solid transition-colors"
      >
        <Plus className="h-4 w-4" />
        Añadir condición
      </button>
    </div>
  );
}

// ─── Value input ──────────────────────────────────────────────────────────────

function ValueInput({
  fieldDef,
  value,
  onChange,
  onCommit,
}: {
  fieldDef: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  const baseClass =
    "px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[180px]";

  if (fieldDef.type === "select" && fieldDef.options) {
    return (
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Selects commit immediately on change
          setTimeout(onCommit, 0);
        }}
        className={baseClass}
      >
        <option value="">Seleccionar…</option>
        {fieldDef.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (fieldDef.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className={baseClass}
      />
    );
  }

  if (fieldDef.type === "number") {
    return (
      <input
        type="number"
        value={value}
        placeholder="Valor…"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
        }}
        className={baseClass}
      />
    );
  }

  // text (default)
  return (
    <input
      type="text"
      value={value}
      placeholder="Valor…"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
      }}
      className={baseClass}
    />
  );
}
