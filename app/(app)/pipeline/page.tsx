import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils/formatters";
import PipelineTriggerButton from "@/components/admin/PipelineTriggerButton";
import PipelineSearch from "@/components/pipeline/PipelineSearch";
import PipelineTable from "@/components/pipeline/PipelineTable";
import type { TenderRow } from "@/components/pipeline/PipelineTable";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pipeline — Tenderloin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    q?: string;
    source?: string;
    contract_type?: string;
    procedure_type?: string;
    buyer_type?: string;
    region?: string;
    cpv?: string;
    status?: string;
    budget_min?: string;
    budget_max?: string;
    lot_count_min?: string;
    lot_count_max?: string;
    duration_min?: string;
    duration_max?: string;
    published_from?: string;
    published_to?: string;
    sort?: string;
    sort_dir?: string;
    page?: string;
    per_page?: string;
  }>;
}

export default async function PipelinePage({ searchParams }: Props) {
  const params = await searchParams;
  const {
    q,
    source,
    contract_type,
    procedure_type,
    buyer_type,
    region,
    cpv,
    status = "active",
    budget_min,
    budget_max,
    lot_count_min,
    lot_count_max,
    duration_min,
    duration_max,
    published_from,
    published_to,
    sort = "published_at",
    sort_dir = "desc",
  } = params;

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const perPage = [10, 25, 50, 100].includes(parseInt(params.per_page ?? "25", 10))
    ? parseInt(params.per_page ?? "25", 10)
    : 25;

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

  if (!isAdmin) redirect("/home");

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

  // Build tenders query — fetch all fields for column selector
  let query = supabase
    .from("tenders_raw")
    .select(
      "id, external_id, title, summary, link, published_at, deadline_at, buyer_name, region, cpv, budget_amount, source, created_at, contract_type, procedure_type, lot_count, duration_months, buyer_type",
      { count: "exact" }
    );

  // Status filter (active = future deadline, inactive = past deadline)
  if (status === "active") {
    query = query.gt("deadline_at", now.toISOString());
  } else if (status === "inactive") {
    query = query.lte("deadline_at", now.toISOString());
  }
  // "all" → no deadline filter

  // Text search
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`title.ilike.${term},buyer_name.ilike.${term}`);
  }

  // Field filters
  if (source && source.trim()) query = query.ilike("source", `%${source.trim()}%`);
  if (contract_type) query = query.eq("contract_type", contract_type);
  if (procedure_type && procedure_type.trim()) query = query.ilike("procedure_type", `%${procedure_type.trim()}%`);
  if (buyer_type && buyer_type.trim()) query = query.ilike("buyer_type", `%${buyer_type.trim()}%`);
  if (region) query = query.eq("region", region);
  if (cpv) query = query.like("cpv", `${cpv}%`);

  // Numeric ranges
  if (budget_min) query = query.gte("budget_amount", parseFloat(budget_min));
  if (budget_max) query = query.lte("budget_amount", parseFloat(budget_max));
  if (lot_count_min) query = query.gte("lot_count", parseInt(lot_count_min, 10));
  if (lot_count_max) query = query.lte("lot_count", parseInt(lot_count_max, 10));
  if (duration_min) query = query.gte("duration_months", parseInt(duration_min, 10));
  if (duration_max) query = query.lte("duration_months", parseInt(duration_max, 10));

  // Date ranges
  if (published_from) query = query.gte("published_at", published_from);
  if (published_to) query = query.lte("published_at", `${published_to}T23:59:59`);

  // Sorting
  const validSortFields = [
    "published_at",
    "deadline_at",
    "budget_amount",
    "lot_count",
    "duration_months",
    "created_at",
  ];
  const sortField = validSortFields.includes(sort) ? sort : "published_at";
  const ascending = sort_dir === "asc";
  query = query.order(sortField, { ascending, nullsFirst: false });

  // Pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: tenders, error, count: filteredCount } = await query;
  if (error) throw error;

  const totalPages = Math.ceil((filteredCount ?? 0) / perPage);

  return (
    <div className="max-w-full space-y-6">
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
              <p className="text-xs text-muted-foreground">Hace {hoursAgo}h</p>
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
      <PipelineSearch
        q={q}
        source={source}
        contractType={contract_type}
        procedureType={procedure_type}
        buyerType={buyer_type}
        region={region}
        cpv={cpv}
        status={status}
        budgetMin={budget_min}
        budgetMax={budget_max}
        lotCountMin={lot_count_min}
        lotCountMax={lot_count_max}
        durationMin={duration_min}
        durationMax={duration_max}
        publishedFrom={published_from}
        publishedTo={published_to}
        perPage={perPage}
      />

      {/* Tender table with column selector */}
      <PipelineTable
        tenders={(tenders ?? []) as TenderRow[]}
        currentSort={sortField}
        currentDir={sort_dir}
        totalPages={totalPages}
        currentPage={page}
        perPage={perPage}
        filteredCount={filteredCount ?? 0}
      />
    </div>
  );
}
