import { createClient } from "@/lib/supabase/server";
import type { InboxTender, ScoreDistribution, ScoredTenderEntry, TestTender, TrainingTender } from "@/lib/types/app.types";

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

/** Fetch tenders that passed the project's hard filters and have a future deadline.
 *  Reads from ``tender_filter_results`` (single source of truth) joined with
 *  ``tenders_raw``.  Model scores and analysis status are included. */
export async function getInboxTenders(projectId: string): Promise<InboxTender[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tender_filter_results")
    .select(
      `inbox_seen_at,
       tenders_raw!inner (
         id, title, summary, link, published_at, deadline_at,
         buyer_name, region, cpv, budget_amount, contract_type,
         procedure_type, lot_count, duration_months, buyer_type,
         status, external_id, source, created_at,
         tender_model_scores ( model_score, project_id, model_version ),
         tender_analysis!left ( status, project_id )
       )`
    )
    .eq("project_id", projectId)
    .eq("passed", true)
    .gt("tenders_raw.deadline_at", now)
    .order("published_at", { ascending: false, referencedTable: "tenders_raw" })
    .limit(500);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (data ?? []).map((row: any) => {
    const tender = row.tenders_raw as Record<string, unknown>;
    const inbox_seen_at: string | null = row.inbox_seen_at ?? null;

    const modelScores = Array.isArray(tender.tender_model_scores)
      ? tender.tender_model_scores
      : tender.tender_model_scores
      ? [tender.tender_model_scores]
      : [];

    const projectModelScore = (modelScores as { project_id: string; model_score: number; model_version: string }[])
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => b.model_version.localeCompare(a.model_version))[0];

    const analyses = Array.isArray(tender.tender_analysis)
      ? tender.tender_analysis
      : tender.tender_analysis
      ? [tender.tender_analysis]
      : [];
    const projectAnalysis = (analyses as { project_id: string; status: string }[]).find(
      (a) => a.project_id === projectId
    );

    const { tender_model_scores: _tms, tender_analysis: _ta, ...tenderFields } = tender;
    void _tms; void _ta;

    return {
      ...tenderFields,
      model_score: projectModelScore?.model_score ?? null,
      human_score_avg: null,
      analysis_status: projectAnalysis?.status ?? null,
      inbox_seen_at,
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
 *  Returns up to `limit` OUTDATED tenders (past deadline) that passed the
 *  project's hard filters, have NOT yet been scored by this user in the current
 *  training session, and are not in the provided `excludeIds` list.
 *
 *  Reads from ``tender_filter_results`` as single source of truth. */
export async function getTrainingTenderBatch(
  projectId: string,
  excludeIds: number[] = [],
  limit = 10
): Promise<TrainingTender[]> {
  const supabase = await createClient();
  const trainingSession = await getTrainingSession(projectId);
  const now = new Date().toISOString();

  // Limit to 500 to keep the NOT IN clause within HTTP GET URL size limits.
  const { data: scoredRows } = await supabase
    .from("tender_scores")
    .select("tender_id")
    .eq("project_id", projectId)
    .eq("training_session", trainingSession)
    .limit(500);

  const scoredIds = (scoredRows ?? []).map((r) => r.tender_id);
  const allExcluded = [...new Set([...scoredIds, ...excludeIds])];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("tender_filter_results")
    .select(
      `tender_id,
       tenders_raw!inner (
         id, title, summary, link, buyer_name, budget_amount,
         published_at, deadline_at, cpv, region, contract_type, procedure_type
       )`
    )
    .eq("project_id", projectId)
    .eq("passed", true)
    .lt("tenders_raw.deadline_at", now)
    .order("deadline_at", { ascending: false, referencedTable: "tenders_raw" })
    .limit(limit);

  if (allExcluded.length > 0) {
    query = query.not("tender_id", "in", `(${allExcluded.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => row.tenders_raw as TrainingTender);
}

/** Fetch the score distribution (count per score 0-5) for a project,
 *  aggregated across all users in the current training session. */
export async function getScoreDistribution(projectId: string): Promise<ScoreDistribution[]> {
  const supabase = await createClient();
  const trainingSession = await getTrainingSession(projectId);

  const { data, error } = await supabase
    .from("tender_scores")
    .select("score")
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
    .order("scored_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const t = Array.isArray(row.tenders_raw) ? row.tenders_raw[0] : row.tenders_raw;
    return {
      tender_id: row.tender_id,
      score: row.score,
      scored_at: row.scored_at,
      title: t?.title ?? "(sin t\u00edtulo)",
      cpv: t?.cpv ?? null,
      region: t?.region ?? null,
    } as ScoredTenderEntry;
  });
}
