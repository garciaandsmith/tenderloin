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

/** Fetch the current training session number for a project. */
async function getTrainingSession(projectId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("training_session")
    .eq("id", projectId)
    .single();
  return data?.training_session ?? 1;
}

/** Fetch tenders matching the project's hard filters with a future deadline.
 *  Ordered by published_at desc (model scores are populated by the offline pipeline). */
export async function getInboxTenders(projectId: string): Promise<InboxTender[]> {
  const supabase = await createClient();
  const filters = await getProjectFilters(projectId);

  let query = supabase
    .from("tenders_raw")
    .select(
      "*, tender_model_scores ( model_score, project_id, model_version ), tender_analysis!left ( status, project_id )"
    )
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

    // Find analysis status for this specific project
    const analyses = Array.isArray(row.tender_analysis)
      ? row.tender_analysis
      : row.tender_analysis
      ? [row.tender_analysis]
      : [];
    const projectAnalysis = analyses.find(
      (a: { project_id: string }) => a.project_id === projectId
    );

    const { tender_model_scores: _tms, tender_analysis: _ta, ...tender } = row as Record<string, unknown>;
    void _tms;
    void _ta;

    return {
      ...(tender as Parameters<typeof Object.assign>[0]),
      model_score: projectModelScore?.model_score ?? null,
      human_score_avg: null,
      analysis_status: projectAnalysis?.status ?? null,
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

/** Fetch a batch of unscored tenders for the training queue.
 *  Returns up to `limit` OUTDATED tenders (past deadline) matching the project's
 *  hard filters that have NOT yet been scored by ANY user in the current training
 *  session, and are not in the provided `excludeIds` list.
 *
 *  Training must use expired tenders so they never appear in the active inbox. */
export async function getTrainingTenderBatch(
  projectId: string,
  excludeIds: number[] = [],
  limit = 10
): Promise<TrainingTender[]> {
  const supabase = await createClient();
  const [filters, trainingSession] = await Promise.all([
    getProjectFilters(projectId),
    getTrainingSession(projectId),
  ]);

  const { data: scoredRows } = await supabase
    .from("tender_scores")
    .select("tender_id")
    .eq("project_id", projectId)
    .eq("training_session", trainingSession);

  const scoredIds = (scoredRows ?? []).map((r) => r.tender_id);
  const allExcluded = [...new Set([...scoredIds, ...excludeIds])];

  let query = supabase
    .from("tenders_raw")
    .select("id, title, summary, link, buyer_name, budget_amount, published_at, deadline_at, cpv, region, contract_type, procedure_type")
    // Outdated tenders only — past deadline, never active inbox items
    .lt("deadline_at", new Date().toISOString())
    .order("deadline_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(limit);

  query = applyHardFilters(query, filters);

  if (allExcluded.length > 0) {
    query = query.not("id", "in", `(${allExcluded.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TrainingTender[];
}

/** Fetch the score distribution (count per score 0-5) for a project,
 *  aggregated across all users in the current training session. */
export async function getScoreDistribution(projectId: string): Promise<ScoreDistribution[]> {
  const supabase = await createClient();
  const trainingSession = await getTrainingSession(projectId);

  const { data, error } = await supabase
    .from("tender_scores")
    .select("*")
    .eq("project_id", projectId)
    .eq("training_session", trainingSession);

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

/** Count total tenders scored by all users in the current training session for a project. */
export async function getScoredCount(projectId: string): Promise<number> {
  const supabase = await createClient();
  const trainingSession = await getTrainingSession(projectId);

  const { count, error } = await supabase
    .from("tender_scores")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("training_session", trainingSession);

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

/** Fetch all scored tenders for a project in the current training session,
 *  across all users. Used in the Historial tab. */
export async function getScoredTenders(
  projectId: string
): Promise<ScoredTenderEntry[]> {
  const supabase = await createClient();
  const trainingSession = await getTrainingSession(projectId);

  const { data, error } = await supabase
    .from("tender_scores")
    .select("tender_id, score, scored_at, tenders_raw ( title, cpv, region )")
    .eq("project_id", projectId)
    .eq("training_session", trainingSession)
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
