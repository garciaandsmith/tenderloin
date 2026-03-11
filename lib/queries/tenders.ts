import { createClient } from "@/lib/supabase/server";
import { getProjectFilters } from "@/lib/queries/projects";
import type { InboxTender, ScoreDistribution, ScoredTenderEntry, TestTender, TrainingTender, ProjectFilters } from "@/lib/types/app.types";

/** Apply project hard-filters directly to a tenders_raw query builder.
 *  Eliminates the dependency on tender_filter_results (which is populated by the
 *  offline pipeline and may be empty until Phase 2 is implemented). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyHardFilters(query: any, filters: ProjectFilters | null): any {
  if (!filters) return query;
  if (filters.budget_min != null) query = query.gte("budget_amount", filters.budget_min);
  if (filters.budget_max != null) query = query.lte("budget_amount", filters.budget_max);
  if (filters.regions && filters.regions.length > 0) query = query.in("region", filters.regions);
  if (filters.cpv_codes && filters.cpv_codes.length > 0) {
    query = query.or(filters.cpv_codes.map((c: string) => `cpv.like.${c}%`).join(","));
  }
  return query;
}

/** Fetch tenders matching the project's hard filters with a future deadline.
 *  Ordered by published_at desc (model scores are populated by the offline pipeline). */
export async function getInboxTenders(projectId: string): Promise<InboxTender[]> {
  const supabase = await createClient();
  const filters = await getProjectFilters(projectId);

  let query = supabase
    .from("tenders_raw")
    .select("*, tender_model_scores ( model_score, project_id, model_version )")
    .gt("deadline_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  query = applyHardFilters(query, filters);

  const { data, error } = await query;
  if (error) throw error;

  const mapped = (data ?? []).map((row) => {
    const modelScores = Array.isArray(row.tender_model_scores)
      ? row.tender_model_scores
      : row.tender_model_scores
      ? [row.tender_model_scores]
      : [];

    const projectModelScore = modelScores
      .filter((s: { project_id: string }) => s.project_id === projectId)
      .sort(
        (a: { model_version: string }, b: { model_version: string }) =>
          b.model_version.localeCompare(a.model_version)
      )[0];

    const { tender_model_scores: _tms, ...tender } = row as Record<string, unknown>;
    void _tms;

    return {
      ...(tender as Parameters<typeof Object.assign>[0]),
      model_score: projectModelScore?.model_score ?? null,
      human_score_avg: null,
    } as InboxTender;
  });

  // Sort by model_score DESC (nulls last), then by published_at DESC as tiebreaker.
  return mapped.sort((a, b) => {
    if (a.model_score !== null && b.model_score !== null) {
      return b.model_score - a.model_score;
    }
    if (a.model_score !== null) return -1;
    if (b.model_score !== null) return 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });
}

/** Fetch the next unscored tender for the training queue.
 *  Returns tenders matching the project's hard filters that have NOT yet been
 *  scored by this user. */
export async function getNextTrainingTender(
  projectId: string,
  userId: string
): Promise<TrainingTender | null> {
  const supabase = await createClient();
  const filters = await getProjectFilters(projectId);

  const { data: scoredRows } = await supabase
    .from("tender_scores")
    .select("tender_id")
    .eq("project_id", projectId)
    .eq("scored_by", userId);

  const scoredIds = (scoredRows ?? []).map((r) => r.tender_id);

  let query = supabase
    .from("tenders_raw")
    .select("id, title, summary, link, buyer_name, budget_amount, published_at, cpv, region, contract_type, procedure_type")
    .order("published_at", { ascending: false })
    .limit(1);

  query = applyHardFilters(query, filters);

  if (scoredIds.length > 0) {
    query = query.not("id", "in", `(${scoredIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  return data[0] as TrainingTender;
}

/** Fetch the score distribution (count per score 0-5) for a project and user.
 *  Scoped to the current user so the chart reflects their personal training progress. */
export async function getScoreDistribution(projectId: string, userId: string): Promise<ScoreDistribution[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tender_scores")
    .select("*")
    .eq("project_id", projectId)
    .eq("scored_by", userId);

  if (error) throw error;

  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of data ?? []) {
    counts[row.score] = (counts[row.score] ?? 0) + 1;
  }

  return Object.entries(counts).map(([score, count]) => ({
    score: Number(score),
    count,
  }));
}

/** Count total tenders scored by the current user in a project. */
export async function getScoredCount(projectId: string, userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("tender_scores")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("scored_by", userId);

  if (error) throw error;
  return count ?? 0;
}

/** Fetch a tender that has a model prediction for TEST THE TRAINING mode.
 *  Returns null when the model has not yet scored any tenders for this project.
 *  Accepts an optional skipId to avoid showing the same tender twice in a row. */
export async function getNextTestTender(
  projectId: string,
  skipId?: number
): Promise<TestTender | null> {
  const supabase = await createClient();

  // 1. Fetch tender IDs that the model has already scored for this project.
  //    Order by scored_at desc so we prefer recently-scored tenders.
  const { data: modelScoreRows, error: msError } = await supabase
    .from("tender_model_scores")
    .select("tender_id, model_score")
    .eq("project_id", projectId)
    .order("scored_at", { ascending: false })
    .limit(100);

  if (msError) throw msError;
  if (!modelScoreRows || modelScoreRows.length === 0) return null;

  // 2. Pick the first model-scored tender that is not the one we're skipping.
  const candidate = modelScoreRows.find((r) => r.tender_id !== skipId);
  if (!candidate) return null;

  // 3. Fetch the full tender row.
  const { data: tenderRows, error: tError } = await supabase
    .from("tenders_raw")
    .select("id, title, summary, link, buyer_name, budget_amount, published_at, cpv, region, contract_type, procedure_type")
    .eq("id", candidate.tender_id)
    .limit(1);

  if (tError) throw tError;
  if (!tenderRows || tenderRows.length === 0) return null;

  return {
    ...(tenderRows[0] as TrainingTender),
    model_score: candidate.model_score as number,
  };
}

/** Fetch all scored tenders for a project+user including tender metadata.
 *  Used in the Historial tab to browse scores by CPV and other filters. */
export async function getScoredTenders(
  projectId: string,
  userId: string
): Promise<ScoredTenderEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tender_scores")
    .select("tender_id, score, scored_at, tenders_raw ( title, cpv, region )")
    .eq("project_id", projectId)
    .eq("scored_by", userId)
    .order("scored_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const t = Array.isArray(row.tenders_raw) ? row.tenders_raw[0] : row.tenders_raw;
    return {
      tender_id: row.tender_id,
      score: row.score,
      scored_at: row.scored_at,
      title: t?.title ?? "(sin título)",
      cpv: t?.cpv ?? null,
      region: t?.region ?? null,
    } as ScoredTenderEntry;
  });
}
