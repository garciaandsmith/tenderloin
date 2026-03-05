import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatBudget, formatDate, daysUntil } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import { nutsLabel } from "@/lib/utils/nuts";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const metadata = { title: "Licitación — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string; tenderId: string }>;
}

export default async function TenderDetailPage({ params }: Props) {
  const { projectId, tenderId } = await params;

  const supabase = await createClient();
  const { data: tender } = await supabase
    .from("tenders_raw")
    .select("*")
    .eq("id", Number(tenderId))
    .single();

  if (!tender) notFound();

  const { data: analysis } = await supabase
    .from("tender_analysis")
    .select("*")
    .eq("tender_id", tender.id)
    .maybeSingle();

  const deadline = daysUntil(tender.deadline_at);

  return (
    <div className="max-w-3xl mx-auto">
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
        <div>
          <h1 className="text-xl font-bold leading-snug">{tender.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tender.buyer_name}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Presupuesto" value={formatBudget(tender.budget_amount)} />
          <Stat label="Región" value={nutsLabel(tender.region) || tender.region} />
          <Stat label="CPV" value={cpvLabel(tender.cpv) || tender.cpv} />
          <Stat
            label="Plazo"
            value={
              <span className={deadline.expired ? "text-destructive" : deadline.urgent ? "text-amber-600" : ""}>
                {formatDate(tender.deadline_at)} ({deadline.label})
              </span>
            }
          />
        </div>

        <div>
          <h2 className="font-semibold mb-2">Descripción</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line">{tender.summary}</p>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <a
            href={tender.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
          >
            Ver en PLACSP <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Deep analysis section — Phase 2 */}
        {analysis ? (
          <div className="space-y-4 pt-4 border-t">
            <h2 className="font-semibold">Análisis profundo</h2>
            {analysis.status === "pending" || analysis.status === "running" ? (
              <p className="text-sm text-muted-foreground">Análisis en curso…</p>
            ) : analysis.status === "error" ? (
              <p className="text-sm text-destructive">El análisis falló. Intenta de nuevo.</p>
            ) : (
              <div className="space-y-4 text-sm">
                {analysis.key_data_summary && (
                  <AnalysisSection title="Datos clave y plazos" content={analysis.key_data_summary} />
                )}
                {analysis.services_required && (
                  <AnalysisSection title="Servicios requeridos" content={analysis.services_required} />
                )}
                {analysis.technical_conditions && (
                  <AnalysisSection title="Condiciones técnicas" content={analysis.technical_conditions} />
                )}
                {analysis.administrative_conditions && (
                  <AnalysisSection title="Condiciones administrativas" content={analysis.administrative_conditions} />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              El análisis profundo (pliego de condiciones, requisitos técnicos y administrativos) estará disponible en la siguiente fase.
            </p>
          </div>
        )}
      </div>
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
      <p className="font-medium mt-0.5">{value}</p>
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
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="leading-relaxed text-muted-foreground whitespace-pre-line">{content}</p>
    </div>
  );
}
