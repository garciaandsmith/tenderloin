"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  projectId: string;
  initialTechnicalPrompt: string | null;
  initialAdministrativePrompt: string | null;
}

const MAX_LENGTH = 6000;

export default function AnalysisPromptsForm({
  projectId,
  initialTechnicalPrompt,
  initialAdministrativePrompt,
}: Props) {
  const [technicalPrompt, setTechnicalPrompt] = useState(initialTechnicalPrompt ?? "");
  const [administrativePrompt, setAdministrativePrompt] = useState(
    initialAdministrativePrompt ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/analysis-prompts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_technical: technicalPrompt.trim() || null,
          prompt_administrative: administrativePrompt.trim() || null,
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error ?? "Error al guardar los prompts");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Si un prompt está vacío, el análisis correspondiente no podrá ejecutarse hasta que lo
        configures.
      </p>

      {/* Technical prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-technical">Prompt — Análisis técnico (PPT)</Label>
          <span className="text-xs text-muted-foreground">
            {technicalPrompt.length}/{MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="prompt-technical"
          value={technicalPrompt}
          onChange={(e) => {
            setTechnicalPrompt(e.target.value);
            setSuccess(false);
          }}
          placeholder="Escribe aquí las instrucciones para Claude al analizar el Pliego de Prescripciones Técnicas…"
          rows={12}
          maxLength={MAX_LENGTH}
          className="font-mono text-sm resize-y"
        />
      </div>

      {/* Administrative prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-administrative">Prompt — Análisis administrativo (PCAP)</Label>
          <span className="text-xs text-muted-foreground">
            {administrativePrompt.length}/{MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="prompt-administrative"
          value={administrativePrompt}
          onChange={(e) => {
            setAdministrativePrompt(e.target.value);
            setSuccess(false);
          }}
          placeholder="Escribe aquí las instrucciones para Claude al analizar el Pliego de Cláusulas Administrativas…"
          rows={12}
          maxLength={MAX_LENGTH}
          className="font-mono text-sm resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Guardando…" : "Guardar prompts"}
        </Button>
        {success && (
          <span className="text-sm text-green-600">Prompts guardados correctamente.</span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
