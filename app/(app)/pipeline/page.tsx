import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate, formatBudget, daysUntil } from "@/lib/utils/formatters";
import { cpvLabel } from "@/lib/utils/cpv";
import { nutsLabel } from "@/lib/utils/nuts";
import PipelineTriggerButton from "@/components/admin/PipelineTriggerButton";
import PipelineSearch from "@/components/pipeline/PipelineSearch";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Pipeline — Tenderloin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    q?: string;
    contract_type?: string;
    region?: string;
  }>;
}

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

export default async function PipelinePage({ searchParams }: Props) {
  const { q, contract_type, region } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Pipeline status
  const [{ data: stateRow }, { count: totalTenders }] = await Promise.all([
    supabase
      .from("pipeline_state")
      .select("*")
      .eq("key", "capture.last_successful_run_at")
      .maybeSingle(),
    supabase
      .from("tenders_raw")
      .select("*", { count: "exact", head: true }),
  ]);

  const lastRun = stateRow?.value ? new Date(stateRow.value) : null;
  const now = new Date();
  const capturedToday =
    lastRun !== null &&
    lastRun.getFullYear() === now.getFullYear() &&
    lastRun.getMonth() === now.getMonth() &&
    lastRun.getDate() === now.getDate();
  const hoursAgo = lastRun
    ? Math.round((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60))
    : null;

  // Build tenders query with search + filters
  let query = supabase
    .from("tenders_raw")
    .select("id, title, buyer_name, cpv, region, budget_amount, published_at, deadline_at, contract_type, status")
    .gt("deadline_at", now.toISOString())
    .order("published_at", { ascending: false })
    .limit(200);

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`title.ilike.${term},buyer_name.ilike.${term}`);
  }
  if (contract_type) {
    query = query.eq("contract_type", contract_type);
  }
  if (region) {
    query = query.eq("region", region);
  }

  const { data: tenders, error } = await query;
  if (error) throw error;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Licitaciones públicas disponibles en la plataforma
          </p>
        </div>
      </div>

      {/* Pipeline status bar */}
      <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Última captura</p>
            <p className="font-semibold mt-0.5">
              {lastRun ? formatDate(lastRun.toISOString()) : "Nunca"}
            </p>
            {hoursAgo !== null && (
              <p className="text-xs text-muted-foreground">
                Hace {hoursAgo}h
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total en base de datos</p>
            <p className="font-semibold mt-0.5">{totalTenders?.toLocaleString("es-ES") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Estado de hoy</p>
            <p
              className={cn(
                "font-semibold mt-0.5 text-sm",
                capturedToday ? "text-green-600" : "text-amber-600"
              )}
            >
              {capturedToday
                ? "Captura completada hoy"
                : lastRun
                ? "Pendiente de captura"
                : "Sin capturas registradas"}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="shrink-0">
            <PipelineTriggerButton disabled={capturedToday} />
          </div>
        )}
      </div>

      {!capturedToday && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Las licitaciones de hoy aún no se han cargado. La captura automatizada se ejecuta cada día a las 07:00 UTC.
          {isAdmin && " Puedes lanzarla manualmente con el botón de arriba."}
        </div>
      )}

      {/* Search and filters */}
      <PipelineSearch q={q} contractType={contract_type} region={region} />

      {/* Tender list */}
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          {tenders?.length ?? 0} licitación{(tenders?.length ?? 0) !== 1 ? "es" : ""} con plazo activo
          {q ? ` · búsqueda: "${q}"` : ""}
        </p>

        {tenders && tenders.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            {/* Column headers */}
            <div className="hidden lg:grid grid-cols-[1fr_160px_120px_100px_110px_110px] gap-4 px-4 py-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Licitación / Contratante</span>
              <span>CPV</span>
              <span>Región</span>
              <span className="text-right">Presupuesto</span>
              <span className="text-right">Plazo</span>
              <span className="text-right">Publicado</span>
            </div>

            {tenders.map((tender) => {
              const deadline = daysUntil(tender.deadline_at);
              return (
                <div
                  key={tender.id}
                  className="grid grid-cols-1 lg:grid-cols-[1fr_160px_120px_100px_110px_110px] gap-2 lg:gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <p className="font-medium leading-snug line-clamp-2 flex-1">{tender.title}</p>
                      <a
                        href={`https://contrataciondelsectorpublico.gob.es/wps/portal/plataforma/busqueda/!ut/p/b1/hY1LDoIwFEX_CLSX_h6XyIAxSiIkLEiHiJFgkIIwMZ4_oAvQ3dznBBLIIAX9ij5v6EgHp_h5N5WLYSwrGlSoEFIAzUFUPpNdYkGhCFIogE3JRaLf3hLDoV1hm9tEuYwu1m-cqwkzT-y_f7f/${tender.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-primary"
                        title="Ver en PLACSP"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">{tender.buyer_name}</p>
                      {tender.contract_type && (
                        <span className="shrink-0 text-[10px] bg-muted rounded px-1.5 py-0.5">
                          {CONTRACT_TYPE_LABELS[tender.contract_type] ?? tender.contract_type}
                        </span>
                      )}
                      {tender.status && (
                        <span className="shrink-0 text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                          {STATUS_LABELS[tender.status] ?? tender.status}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground truncate lg:pt-0.5">
                    {cpvLabel(tender.cpv ?? "") || tender.cpv || "—"}
                  </div>

                  <div className="text-xs text-muted-foreground truncate lg:pt-0.5">
                    {nutsLabel(tender.region ?? "") || tender.region || "—"}
                  </div>

                  <div className="text-xs font-medium text-right">
                    {formatBudget(tender.budget_amount)}
                  </div>

                  <div
                    className={cn(
                      "text-xs text-right",
                      deadline.expired
                        ? "text-destructive"
                        : deadline.urgent
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {deadline.label}
                  </div>

                  <div className="text-xs text-muted-foreground text-right">
                    {formatDate(tender.published_at)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            <p className="font-medium">No hay licitaciones</p>
            <p className="text-sm mt-1">
              {q
                ? "No se encontraron licitaciones con ese criterio de búsqueda."
                : "No hay licitaciones con plazo activo en la base de datos."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
