import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatBudget, formatDate, daysUntil } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import { nutsLabel } from "@/lib/utils/nuts";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import ScoreBadge from "@/components/inbox/ScoreBadge";
import ProcessButton from "@/components/inbox/ProcessButton";
import AnalysisPoller from "@/components/inbox/AnalysisPoller";

export const dynamic = "force-dynamic";
export const metadata = { title: "Licitación — Tenderloin" };

const STATUS_LABELS: Record<string, string> = {
  PUB: "Publicada",
  ADJ: "Adjudicada",
  FOR: "Formalizada",
  EV: "En evaluación",
  AN: "Anulada",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  services: "Servicios",
  supplies: "Suministros",
  works: "Obras",
  concession: "Concesión",
};

const PROCEDURE_TYPE_LABELS: Record<string, string> = {
  open: "Abierto",
  restricted: "Restringido",
  negotiated: "Negociado",
  minor: "Menor",
};

interface Props {
  params: Promise<{ projectId: string; tenderId: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalysisRow = Record<string, any> | null;

export default async function TenderDetailPage({ params }: Props) {
  const { projectId, tenderId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tender } = await supabase
    .from("tenders_raw")
    .select("*")
    .eq("id", Number(tenderId))
    .single();

  if (!tender) notFound();

  const [
    { data: analysisRows },
    { data: modelScoreRow },
  ] = await Promise.all([
    supabase
      .from("tender_analysis")
      .select("*")
      .eq("tender_id", tender.id)
      .eq("project_id", projectId),
    supabase
      .from("tender_model_scores")
      .select("model_score, model_version, scored_at")
      .eq("tender_id", tender.id)
      .eq("project_id", projectId)
      .order("scored_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const technicalAnalysis: AnalysisRow =
    analysisRows?.find((r) => r.analysis_type === "technical") ?? null;
  const adminAnalysis: AnalysisRow =
    analysisRows?.find((r) => r.analysis_type === "administrative") ?? null;

  const canProcessTechnical =
    !technicalAnalysis || technicalAnalysis.status === "error";
  const canProcessAdmin =
    !adminAnalysis || adminAnalysis.status === "error";

  const hasPendingAnalysis =
    technicalAnalysis?.status === "pending" || technicalAnalysis?.status === "running" ||
    adminAnalysis?.status === "pending" || adminAnalysis?.status === "running";

  const deadline = daysUntil(tender.deadline_at);

  return (
    <div className="max-w-3xl mx-auto">
      <AnalysisPoller isActive={hasPendingAnalysis} />
      <div className="mb-6">
        <Link
          href={`/projects/${projectId}/inbox`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la bandeja
        </Link>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold leading-snug">{tender.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tender.buyer_name}</p>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <ScoreBadge score={modelScoreRow?.model_score ?? null} className="text-base px-3 py-1" />
            {modelScoreRow?.model_version && (
              <span className="text-[10px] text-muted-foreground">
                v{modelScoreRow.model_version}
              </span>
            )}
          </div>
        </div>

        {/* Key data grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Stat label="Contratante" value={tender.buyer_name} />
          <Stat label="Presupuesto estimado" value={formatBudget(tender.budget_amount)} />
          <Stat label="Región" value={nutsLabel(tender.region) || tender.region} />
          <Stat label="Código CPV" value={`${tender.cpv}${cpvLabel(tender.cpv) ? ` — ${cpvLabel(tender.cpv)}` : ""}`} />
          <Stat
            label="Tipo de contrato"
            value={CONTRACT_TYPE_LABELS[tender.contract_type ?? ""] ?? tender.contract_type ?? "—"}
          />
          <Stat
            label="Tipo de procedimiento"
            value={PROCEDURE_TYPE_LABELS[tender.procedure_type ?? ""] ?? tender.procedure_type ?? "—"}
          />
          <Stat
            label="Estado"
            value={STATUS_LABELS[tender.status ?? ""] ?? tender.status ?? "—"}
          />
          <Stat
            label="Plazo de presentación"
            value={
              <span className={deadline.expired ? "text-destructive" : deadline.urgent ? "text-amber-600" : ""}>
                {formatDate(tender.deadline_at)} ({deadline.label})
              </span>
            }
          />
          <Stat label="Publicado" value={formatDate(tender.published_at)} />
        </div>

        {/* Description */}
        <div>
          <h2 className="font-semibold mb-2">Objeto del contrato</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line">{tender.summary}</p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <a
            href={tender.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
          >
            Ver licitación en PLACSP <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Analysis section */}
        <div className="pt-4 border-t space-y-6">
          <h2 className="font-semibold">Análisis de documentos</h2>

          {/* Technical analysis */}
          <AnalysisPanel
            title="Análisis técnico"
            description="Servicios requeridos, actuaciones y requisitos del equipo (Pliego de Prescripciones Técnicas)."
            analysis={technicalAnalysis}
            canProcess={canProcessTechnical}
            tenderId={tender.id}
            projectId={projectId}
            userId={user!.id}
            analysisType="technical"
          >
            {technicalAnalysis?.status === "done" && (
              <div className="space-y-4">
                {technicalAnalysis.services_required && (
                  <div className="rounded-lg border p-4 space-y-3">
                    <h3 className="font-semibold text-sm">Condiciones del servicio</h3>
                    <AnalysisSection
                      title="Descripción, actuaciones y equipo"
                      content={technicalAnalysis.services_required}
                    />
                  </div>
                )}
                {technicalAnalysis.key_data_summary && (
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold text-sm mb-2">Datos clave y plazos</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {technicalAnalysis.key_data_summary}
                    </p>
                  </div>
                )}
                <AttachedFiles files={technicalAnalysis.attached_files} />
              </div>
            )}
          </AnalysisPanel>

          {/* Administrative analysis */}
          <AnalysisPanel
            title="Análisis administrativo"
            description="Condiciones legales y administrativas, solvencia, garantías y obligaciones (Pliego de Cláusulas Administrativas)."
            analysis={adminAnalysis}
            canProcess={canProcessAdmin}
            tenderId={tender.id}
            projectId={projectId}
            userId={user!.id}
            analysisType="administrative"
          >
            {adminAnalysis?.status === "done" && (
              <div className="space-y-4">
                {adminAnalysis.administrative_conditions && (
                  <div className="rounded-lg border p-4 space-y-3">
                    <h3 className="font-semibold text-sm">Condiciones administrativas</h3>
                    <AnalysisSection
                      title="Entregables, obligaciones y criterios de valoración"
                      content={adminAnalysis.administrative_conditions}
                    />
                  </div>
                )}
                {adminAnalysis.key_data_summary && (
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold text-sm mb-2">Datos clave y plazos</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {adminAnalysis.key_data_summary}
                    </p>
                  </div>
                )}
                <AttachedFiles files={adminAnalysis.attached_files} />
              </div>
            )}
          </AnalysisPanel>
        </div>
      </div>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function AnalysisPanel({
  title,
  description,
  analysis,
  canProcess,
  tenderId,
  projectId,
  userId,
  analysisType,
  children,
}: {
  title: string;
  description: string;
  analysis: AnalysisRow;
  canProcess: boolean;
  tenderId: number;
  projectId: string;
  userId: string;
  analysisType: "technical" | "administrative";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold text-sm">{title}</h3>
        {canProcess && (
          <ProcessButton
            tenderId={tenderId}
            projectId={projectId}
            userId={userId}
            analysisType={analysisType}
            retrying={analysis?.status === "error"}
          />
        )}
      </div>

      {!analysis && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {(analysis?.status === "pending" || analysis?.status === "running") && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          Análisis en curso… Vuelve en unos minutos para ver los resultados.
        </div>
      )}

      {analysis?.status === "error" && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          El análisis encontró un error. Puedes intentarlo de nuevo con el botón de arriba.
        </div>
      )}

      {children}
    </div>
  );
}

function AttachedFiles({ files }: { files: unknown }) {
  if (!Array.isArray(files) || files.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">Documentos adjuntos</h3>
      <ul className="space-y-1">
        {(files as Array<{ name: string; url: string; type: string }>).map((f, i) => (
          <li key={i}>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
            >
              {f.name} <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function AnalysisSection({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</h4>
      <p className="text-sm leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}
