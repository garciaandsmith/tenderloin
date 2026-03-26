"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProjectFilters } from "@/lib/types/app.types";
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

  const [budgetMin, setBudgetMin] = useState(f?.budget_min?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(f?.budget_max?.toString() ?? "");
  const [regions, setRegions] = useState<string[]>(f?.regions ?? []);
  const [cpvCodes, setCpvCodes] = useState<string[]>(f?.cpv_codes ?? []);
  const [contractTypes, setContractTypes] = useState<string[]>(f?.contract_types ?? []);
  const [procedureTypes, setProcedureTypes] = useState<string[]>(f?.procedure_types ?? []);
  const [keywordsInclude, setKeywordsInclude] = useState<string[]>(f?.keywords_include ?? []);
  const [keywordsExclude, setKeywordsExclude] = useState<string[]>(f?.keywords_exclude ?? []);
  const [buyerTypes, setBuyerTypes] = useState<string[]>(f?.buyer_types ?? []);
  const [maxLotCount, setMaxLotCount] = useState(f?.max_lot_count?.toString() ?? "");
  const [minContractMonths, setMinContractMonths] = useState(f?.min_contract_months?.toString() ?? "");
  const [maxContractMonths, setMaxContractMonths] = useState(f?.max_contract_months?.toString() ?? "");

  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [preview, setPreview] = useState<{ current_scores: number; current_passed: number } | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

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

    // Fetch preview counts before showing the confirmation modal
    setLoading(true);
    try {
      const previewRes = await fetch(`/api/projects/${projectId}/filter-change-preview`);
      if (previewRes.ok) {
        const previewData = await previewRes.json();
        setPreview(previewData);
      }
    } catch {
      // preview fetch failure is non-fatal
    }
    setLoading(false);

    setPendingPayload(payload);
    setShowConfirm(true);
  }

  async function confirmSave() {
    if (!pendingPayload) return;
    setShowConfirm(false);
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingPayload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al guardar los filtros.");
    } else {
      setSaved(true);
      router.refresh();
    }
    setLoading(false);
    setPendingPayload(null);
    setPreview(null);
  }

  const CONTRACT_TYPES = [
    { value: "services", label: "Servicios" },
    { value: "supplies", label: "Suministros" },
    { value: "works", label: "Obras" },
    { value: "concession", label: "Concesi\u00f3n" },
  ];

  const PROCEDURE_TYPES = [
    { value: "open", label: "Abierto" },
    { value: "restricted", label: "Restringido" },
    { value: "negotiated", label: "Negociado" },
    { value: "minor", label: "Contrato menor" },
  ];

  const BUYER_TYPES = [
    { value: "central_government", label: "Administraci\u00f3n central" },
    { value: "autonomous_community", label: "Comunidad aut\u00f3noma" },
    { value: "local_entity", label: "Entidad local" },
    { value: "public_entity", label: "Organismo p\u00fablico" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Budget */}
      <CollapsibleSection title="Presupuesto (\u20ac)" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <Field label="M\u00ednimo">
            <Input
              type="number"
              placeholder="40000"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="M\u00e1ximo (opcional)">
            <Input
              type="number"
              placeholder="Sin l\u00edmite"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* Regions */}
      <CollapsibleSection title="Regiones (c\u00f3digos NUTS)" defaultOpen>
        <NutsSelector selected={regions} onChange={setRegions} disabled={readOnly} />
      </CollapsibleSection>

      {/* CPV codes */}
      <CollapsibleSection title="C\u00f3digos CPV" defaultOpen>
        <CpvSelector selected={cpvCodes} onChange={setCpvCodes} disabled={readOnly} />
      </CollapsibleSection>

      {/* Contract types */}
      <CollapsibleSection title="Tipo de contrato" defaultOpen>
        <CheckboxGroup
          items={CONTRACT_TYPES}
          selected={contractTypes}
          onToggle={(v) => !readOnly && toggle(contractTypes, setContractTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </CollapsibleSection>

      {/* Procedure types */}
      <CollapsibleSection title="Tipo de procedimiento">
        <CheckboxGroup
          items={PROCEDURE_TYPES}
          selected={procedureTypes}
          onToggle={(v) => !readOnly && toggle(procedureTypes, setProcedureTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </CollapsibleSection>

      {/* Buyer types */}
      <CollapsibleSection title="Tipo de convocante">
        <CheckboxGroup
          items={BUYER_TYPES}
          selected={buyerTypes}
          onToggle={(v) => !readOnly && toggle(buyerTypes, setBuyerTypes, v)}
          idKey="value"
          labelKey="label"
        />
      </CollapsibleSection>

      {/* Keywords include */}
      <CollapsibleSection title="Palabras clave incluidas">
        <p className="text-xs text-muted-foreground mb-2">
          El t\u00edtulo o resumen debe contener alguna de estas palabras.
        </p>
        <TagInput
          tags={keywordsInclude}
          onRemove={(v) => !readOnly && setKeywordsInclude(keywordsInclude.filter((x) => x !== v))}
          input={includeInput}
          onInputChange={setIncludeInput}
          onAdd={() => addKeyword(includeInput, setIncludeInput, keywordsInclude, setKeywordsInclude)}
          placeholder="A\u00f1adir palabra clave\u2026"
          disabled={readOnly}
        />
      </CollapsibleSection>

      {/* Keywords exclude */}
      <CollapsibleSection title="Palabras clave excluidas">
        <p className="text-xs text-muted-foreground mb-2">
          El t\u00edtulo o resumen no debe contener ninguna de estas palabras.
        </p>
        <TagInput
          tags={keywordsExclude}
          onRemove={(v) => !readOnly && setKeywordsExclude(keywordsExclude.filter((x) => x !== v))}
          input={excludeInput}
          onInputChange={setExcludeInput}
          onAdd={() => addKeyword(excludeInput, setExcludeInput, keywordsExclude, setKeywordsExclude)}
          placeholder="A\u00f1adir palabra excluida\u2026"
          disabled={readOnly}
        />
      </CollapsibleSection>

      {/* Lots & duration */}
      <CollapsibleSection title="Lotes y duraci\u00f3n del contrato">
        <div className="grid grid-cols-3 gap-4">
          <Field label="M\u00e1x. lotes">
            <Input
              type="number"
              placeholder="Sin l\u00edmite"
              value={maxLotCount}
              onChange={(e) => setMaxLotCount(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Duraci\u00f3n m\u00edn. (meses)">
            <Input
              type="number"
              placeholder="\u2014"
              value={minContractMonths}
              onChange={(e) => setMinContractMonths(e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label="Duraci\u00f3n m\u00e1x. (meses)">
            <Input
              type="number"
              placeholder="\u2014"
              value={maxContractMonths}
              onChange={(e) => setMaxContractMonths(e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {!readOnly && (
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" disabled={loading}>
            {loading ? "Comprobando\u2026" : "Guardar filtros"}
          </Button>
          {saved && <span className="text-sm text-green-600">\u2713 Filtros guardados. Recalculando inbox\u2026</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>\u00bfGuardar nuevos filtros?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Al guardar, el sistema recalcular\u00e1 qu\u00e9 licitaciones pasan el filtro.
                  El inbox se actualizar\u00e1 en los pr\u00f3ximos minutos.
                </p>
                {preview !== null && (
                  <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1 text-foreground">
                    <p>
                      <span className="font-medium">{preview.current_passed}</span>{" "}
                      licitaciones pasan el filtro actual.
                    </p>
                    {preview.current_scores > 0 && (
                      <p>
                        <span className="font-medium">{preview.current_scores}</span>{" "}
                        puntuaciones de entrenamiento \u2014 las de licitaciones que sigan
                        encajando con el nuevo filtro se conservar\u00e1n en la nueva sesi\u00f3n.
                      </p>
                    )}
                  </div>
                )}
                <p>Esta acci\u00f3n no se puede deshacer.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmSave}>Confirmar y guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

// \u2500\u2500 Collapsible Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n
function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

// \u2500\u2500 Field \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// \u2500\u2500 CheckboxGroup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n
function CheckboxGroup<T extends Record<string, string>>({
  items,
  selected,
  onToggle,
  idKey,
  labelKey,
}: {
  items: T[];
  selected: string[];
  onToggle: (v: string) => void;
  idKey: keyof T;
  labelKey: keyof T;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const value = item[idKey];
        const label = item[labelKey];
        const checked = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
              checked
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// \u2500\u2500 TagInput \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n
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
                \u00d7
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
            A\u00f1adir
          </Button>
        </div>
      )}
    </div>
  );
}
