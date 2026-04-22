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

// ─── Query rule types ─────────────────────────────────────────────────────────

interface QueryRule {
  field: string;
  op: string;
  value: string;
}

const VALID_FIELDS = new Set([
  "title",
  "buyer_name",
  "contract_type",
  "status",
  "region",
  "budget_amount",
  "published_at",
  "deadline_at",
  "procedure_type",
  "buyer_type",
]);

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{
    filters?: string;
    logic?: string;
    status_filter?: string;
    sort?: string;
    sort_dir?: string;
    page?: string;
    per_page?: string;
  }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PipelinePage({ searchParams }: Props) {
  const params = await searchParams;
  const {
    filters: filtersJson,
    logic = "AND",
    status_filter = "active",
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

  // Parse query builder rules
  let rules: QueryRule[] = [];
  if (filtersJson) {
    try {
      const parsed = JSON.parse(filtersJson);
      if (Array.isArray(parsed)) {
        rules = parsed.filter(
          (r): r is QueryRule =>
            r &&
            typeof r.field === "string" &&
            typeof r.op === "string" &&
            typeof r.value === "string" &&
            VALID_FIELDS.has(r.field) &&
            r.value.trim() !== ""
        );
      }
    } catch {
      // ignore malformed JSON
    }
  }

  // Build tenders query
  let query = supabase
    .from("tenders_raw")
    .select(
      "id, external_id, title, summary, link, published_at, deadline_at, buyer_name, region, cpv_codes, cpv_labels, budget_amount, source, status, created_at, contract_type, procedure_type, lot_count, duration_months, buyer_type",
      { count: "exact" }
    );

  // Deadline-based status filter (applied unconditionally)
  if (status_filter === "active") {
    query = query.gt("deadline_at", now.toISOString());
  } else if (status_filter === "inactive") {
    query = query.lte("deadline_at", now.toISOString());
  }

  // Apply query builder rules
  if (rules.length > 0) {
    if (logic === "OR") {
      // Build a single .or() string
      const orParts = rules.map((rule) => {
        const field = rule.field;
        const val = rule.value.trim();
        switch (rule.op) {
          case "contains":     return `${field}.ilike.%${val}%`;
          case "not_contains": return `${field}.not.ilike.%${val}%`;
          case "is":
          case "eq":           return `${field}.eq.${val}`;
          case "is_not":
          case "neq":          return `${field}.neq.${val}`;
          case "starts_with":  return `${field}.ilike.${val}%`;
          case "gt":           return `${field}.gt.${val}`;
          case "lt":           return `${field}.lt.${val}`;
          case "gte":          return `${field}.gte.${val}`;
          case "lte":          return `${field}.lte.${val}`;
          default:             return null;
        }
      }).filter(Boolean) as string[];

      if (orParts.length > 0) {
        query = query.or(orParts.join(","));
      }
    } else {
      // AND: chain filter calls
      for (const rule of rules) {
        const field = rule.field as string;
        const val = rule.value.trim();
        switch (rule.op) {
          case "contains":
            query = query.ilike(field, `%${val}%`);
            break;
          case "not_contains":
            query = query.not(field, "ilike", `%${val}%`);
            break;
          case "is":
          case "eq":
            query = query.eq(field, val);
            break;
          case "is_not":
          case "neq":
            query = query.neq(field, val);
            break;
          case "starts_with":
            query = query.ilike(field, `${val}%`);
            break;
          case "gt":
            query = query.gt(field, val);
            break;
          case "lt":
            query = query.lt(field, val);
            break;
          case "gte":
            query = query.gte(field, val);
            break;
          case "lte":
            query = query.lte(field, val);
            break;
        }
      }
    }
  }

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

      {/* Query builder */}
      <PipelineSearch
        filtersJson={filtersJson}
        logic={logic}
        statusFilter={status_filter}
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
