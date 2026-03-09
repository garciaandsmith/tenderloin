"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectFilters } from "@/lib/types/app.types";
import { AGENCY_CPV_CODES } from "@/lib/utils/cpv";
import NutsSelector from "@/components/filters/NutsSelector";
import CpvSelector from "@/components/filters/CpvSelector";

interface Props {
  projectId: string;
  initialFilters: ProjectFilters | null;
  readOnly?: boolean;
}

export default function ProjectFiltersForm({ projectId, initialFilters, readOnly = false }: Props) {
  const router = useRouter();
  const f = initialFilters;

  const [budgetMin, setBudgetMin] = useState(f?.budget_min?.toString() ?? "40000");
  const [budgetMax, setBudgetMax] = useState(f?.budget_max?.toString() ?? "");
  const [regions, setRegions] = useState<string[]>(f?.regions ?? ["ES30", "ES300"]);
  const [cpvCodes, setCpvCodes] = useState<string[]>(f?.cpv_codes ?? AGENCY_CPV_CODES.map((c) => c.code));
  const [contractTypes, setContractTypes] = useState<string[]>(f?.contract_types ?? ["services"]);
  const [procedureTypes, setProcedureTypes] = useState<string[]>(f?.procedure_types ?? []);
  const [keywordsInclude, setKeywordsInclude] = useState<string[]>(f?.keywords_include ?? []);
  const [keywordsExclude, setKeywordsExclude] = useState<string[]>(
    f?.keywords_exclude ?? ["suministro", "obras", "stand", "montaje", "compra de medios"]
  );
  const [buyerTypes, setBuyerTypes] = useState<string[]>(f?.buyer_types ?? []);
  const [maxLotCount, setMaxLotCount] = useState(f?.max_lot_count?.toString() ?? "");
  const [minContractMonths, setMinContractMonths] = useState(f?.min_contract_months?.toString() ?? "");
  const [maxContractMonths, setMaxContractMonths] = useState(f?.max_contract_months?.toString() ?? "");

  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle<T>(list: T[], setList: (v: T[]) => void, item: T) {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  function addKeyword(
    input: string,
    setInput: (v: string) => void,
    list: string[],
    setList: (v: string[]) => void
  ) {
    const val = input.trim().toLowerCase();
    if (val && !list.includes(val)) setList([...list, val]);
    setInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError(null);

    const payload = {
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
      regions: regions.length ? regions : null,
      cpv_codes: cpvCodes.length ? cpvCodes : null,
      contract_types: contractTypes.length ? contractTypes : null,
      procedure_types: procedureTypes.length ? procedureTypes : null,
      keywords_include: keywordsInclude.length ? keywordsInclude : null,
      keywords_exclude: keywordsExclude.length ? keywordsExclude : null,
      buyer_types: buyerTypes.length ? buyerTypes : null,
      max_lot_count: maxLotCount ? Number(maxLotCount) : null,
      min_contract_months: minContractMonths ? Number(minContractMonths) : null,
      max_contract_months: maxContractMonths ? Number(maxContractMonths) : null,
    };

    const res = await fetch(`/api/projects/${projectId}/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al guardar los filtros.");
    } else {
      setSaved(true);
      router.refresh();
    }
    setLoading(false);
  }

  const CONTRACT_TYPES = [
    { value: "services", label: "Servicios" },
    { value: "supplies", label: "Suministros" },
    { value: "works", label: "Obras" },
    { value: "concession", label: "Concesión" },
  ];

  const PROCEDURE_TYPES = [
    { value: "open", label: "Abierto" },
    { value: "restricted", label: "Restringido" },
    { value: "negotiated", label: "Negociado" },
    { value: "minor", label: "Contrato menor" },
  ];

  const BUYER_TYPES = [
    { value: "central_government", label: "Administración central" },
    { value: "autonomous_community", label: "Comunidad autónoma" },
    { value: "local_entity", label: "Entidad local" },
    { value: "public_entity", label: "Organismo público" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Budget */}
      <Section title="Presupuesto (€)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mínimo">
            <Input
              type="number"
              placeholder="40000"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Máximo (opcional)">
            <Input
              type="number"
              placeholder="Sin límite"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
      </Section>

      {/* Regions */}
      <Section title="Regiones (códigos NUTS)">
        <NutsSelector selected={regions} onChange={setRegions} disabled={readOnly} />
      </Section>

      {/* CPV codes */}
      <Section title="Códigos CPV">
        <CpvSelector selected={cpvCodes} onChange={setCpvCodes} disabled={readOnly} />
      </Section>

      {/* Contract types */}
      <Section title="Tipo de contrato">
        <CheckboxGroup
          items={CONTRACT_TYPES}
          selected={contractTypes}
          onToggle={(v) => !readOnly && toggle(contractTypes, setContractTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </Section>

      {/* Procedure types */}
      <Section title="Tipo de procedimiento">
        <CheckboxGroup
          items={PROCEDURE_TYPES}
          selected={procedureTypes}
          onToggle={(v) => !readOnly && toggle(procedureTypes, setProcedureTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </Section>

      {/* Buyer types */}
      <Section title="Tipo de convocante">
        <CheckboxGroup
          items={BUYER_TYPES}
          selected={buyerTypes}
          onToggle={(v) => !readOnly && toggle(buyerTypes, setBuyerTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </Section>

      {/* Keywords */}
      <Section title="Palabras clave incluidas (título/resumen debe contener alguna)">
        <TagInput
          tags={keywordsInclude}
          onRemove={(v) => !readOnly && setKeywordsInclude(keywordsInclude.filter((x) => x !== v))}
          input={includeInput}
          onInputChange={setIncludeInput}
          onAdd={() => addKeyword(includeInput, setIncludeInput, keywordsInclude, setKeywordsInclude)}
          placeholder="Añadir palabra clave…"
          disabled={readOnly}
        />
      </Section>

      <Section title="Palabras clave excluidas (título/resumen no debe contener ninguna)">
        <TagInput
          tags={keywordsExclude}
          onRemove={(v) => !readOnly && setKeywordsExclude(keywordsExclude.filter((x) => x !== v))}
          input={excludeInput}
          onInputChange={setExcludeInput}
          onAdd={() => addKeyword(excludeInput, setExcludeInput, keywordsExclude, setKeywordsExclude)}
          placeholder="Añadir palabra excluida…"
          disabled={readOnly}
        />
      </Section>

      {/* Lots & duration */}
      <Section title="Lotes y duración">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Máx. lotes">
            <Input
              type="number"
              placeholder="Sin límite"
              value={maxLotCount}
              onChange={(e) => setMaxLotCount(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Duración mín. (meses)">
            <Input
              type="number"
              placeholder="—"
              value={minContractMonths}
              onChange={(e) => setMinContractMonths(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Duración máx. (meses)">
            <Input
              type="number"
              placeholder="—"
              value={maxContractMonths}
              onChange={(e) => setMaxContractMonths(e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
      </Section>

      {!readOnly && (
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar filtros"}
          </Button>
          {saved && <span className="text-sm text-green-600">✓ Filtros guardados</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TagInput({
  tags,
  onRemove,
  input,
  onInputChange,
  onAdd,
  placeholder,
  disabled,
}: {
  tags: string[];
  onRemove: (v: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="hover:text-destructive transition-colors ml-1"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground">Sin palabras clave</span>
        )}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
            className="max-w-xs text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}
