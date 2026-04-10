import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import IngestionLoaderPanel from "@/components/ingestion/IngestionLoaderPanel";
import IngestionSearch from "@/components/ingestion/IngestionSearch";
import IngestionTable, { TenderRow } from "@/components/ingestion/IngestionTable";

export const metadata = { title: "Ingestion — Tenderloin" };
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

export default async function IngestionPage({ searchParams }: Props) {
  const params = await searchParams;
  const {
    q,
    source,
    contract_type,
    procedure_type,
    buyer_type,
    region,
    cpv,
    status = "all",
    budget_min,
    budget_max,
    lot_count_min,
    lot_count_max,
    duration_min,
    duration_max,
    published_from,
    published_to,
    sort = "ingested_at",
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

  if (profile?.role !== "admin") redirect("/home");

  // Status metrics: read the ingestion-specific state key
  const [{ data: stateRow }, { count: totalTenders }] = await Promise.all([
    supabase
      .from("pipeline_state")
      .select("*")
      .eq("key", "ingestion.last_successful_run_at")
      .maybeSingle(),
    supabase.from("tenders_ingested").select("*", { count: "exact", head: true }),
  ]);

  const lastRunAt = stateRow?.value ?? null;
  const lastRun = lastRunAt ? new Date(lastRunAt) : null;
  const now = new Date();
  const hoursAgo = lastRun
    ? Math.round((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60))
    : null;

  // Build query against tenders_ingested
  let query = supabase.from("tenders_ingested").select(
    "id, external_id, title, summary, link, published_at, deadline_at, buyer_name, region, cpv, budget_amount, source, ingested_at, contract_type, procedure_type, lot_count, duration_months, buyer_type, status, version_at",
    { count: "exact" }
  );

  // Status filter (active = deadline in future, inactive = deadline passed)
  if (status === "active") {
    query = query.gt("deadline_at", now.toISOString());
  } else if (status === "inactive") {
    query = query.lte("deadline_at", now.toISOString());
  }

  // Text search
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `title.ilike.${term},buyer_name.ilike.${term},external_id.ilike.${term},summary.ilike.${term}`
    );
  }

  // Field filters
  if (source) query = query.eq("source", source);
  if (contract_type) query = query.eq("contract_type", contract_type);
  if (procedure_type) query = query.eq("procedure_type", procedure_type);
  if (buyer_type) query = query.ilike("buyer_type", `%${buyer_type}%`);
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

  // Sorting — ingested_at replaces created_at as the default
  const validSortFields = [
    "id",
    "published_at",
    "deadline_at",
    "ingested_at",
    "budget_amount",
    "lot_count",
    "duration_months",
  ];
  const sortField = validSortFields.includes(sort) ? sort : "ingested_at";
  const ascending = sort_dir === "asc";
  query = query.order(sortField, { ascending, nullsFirst: false });

  // Pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: tenders, error, count: filteredCount } = await query;
  if (error) throw error;

  const totalPages = Math.ceil((filteredCount ?? 0) / perPage);

  // Map ingested_at → created_at so IngestionTable (which uses created_at) works unchanged
  const mappedTenders = (tenders ?? []).map((t) => ({
    ...t,
    created_at: (t as Record<string, unknown>).ingested_at ?? null,
  }));

  return (
    <div className="max-w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Ingestion</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Standalone tender ingestion — version-aware data browser and loader
        </p>
      </div>

      {/* Data Loader Panel */}
      <IngestionLoaderPanel lastRunAt={lastRunAt} />

      {/* Status bar */}
      <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Last ingestion run
          </p>
          <p className="font-semibold mt-0.5">
            {lastRun ? formatDate(lastRun.toISOString()) : "Never"}
          </p>
          {hoursAgo !== null && (
            <p className="text-xs text-muted-foreground">{hoursAgo}h ago</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Total records
          </p>
          <p className="font-semibold mt-0.5">
            {totalTenders?.toLocaleString("en-GB") ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Filtered
          </p>
          <p
            className={cn(
              "font-semibold mt-0.5",
              (filteredCount ?? 0) < (totalTenders ?? 0)
                ? "text-primary"
                : ""
            )}
          >
            {(filteredCount ?? 0).toLocaleString("en-GB")}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <IngestionSearch
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

      {/* Table */}
      <IngestionTable
        tenders={mappedTenders as TenderRow[]}
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
