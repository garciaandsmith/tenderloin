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
 *  Four-step: IDs from tender_filter_results → tender rows → model scores → analysis status.
 *  Each query is a simple indexed lookup; avoids PostgREST embedded joins which were
 *  timing out (PostgreSQL error 57014) due to full table scans on unindexed columns. */
export async function getInboxTenders(projectId: string): Promise<InboxTender[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Step 1 — Get passed, non-dismissed tender IDs + inbox_seen_at.
  // Fetch most recent 1000 by tender_id: active (future-deadline) tenders always have high IDs.
  const { data: filterRows, error: filterError } = await supabase
    .from("tender_filter_results")
    .select("tender_id, inbox_seen_at, dismissed_at")
    .eq("project_id", projectId)
    .eq("passed", true)
    .is("dismissed_at", null)
    .order("tender_id", { ascending: false })
    .limit(1000);

  if (filterError) throw filterError;
  if (!filterRows || filterRows.length === 0) return [];

  const filteredIds = filterRows.map((r) => r.tender_id);
  const seenAtMap = new Map(
    filterRows.map((r) => [r.tender_id, (r.inbox_seen_at as string | null) ?? null])
  );

  // Step 2 — Fetch active tender rows (no embedded joins).
  const { data, error } = await supabase
    .from("tenders_raw")
    .select("*")
    .in("id", filteredIds)
    .gt("deadline_at", now)
    .order("published_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  const tenderRows = data ?? [];
  if (tenderRows.length === 0) return [];

  const finalIds = tenderRows.map((r) => r.id);

  // Step 3 — Fetch model scores for this project (indexed on project_id, tender_id).
  const { data: msRows, error: msError } = await supabase
    .from("tender_model_scores")
    .select("tender_id, model_score, model_version")
    .eq("project_id", projectId)
    .in("tender_id", finalIds);

  if (msError) throw msError;

  // Keep highest model_version per tender.
  // "neutral" is the fallback version used when no model artifact exists and scores default to 3.0;
  // it must always lose to any real (date-based) version string like "20260407".
  function compareVersions(a: string, b: string): number {
    if (a === "neutral" && b !== "neutral") return -1;
    if (b === "neutral" && a !== "neutral") return 1;
    return a.localeCompare(b);
  }

  const modelScoreMap = new Map<number, { model_score: number; model_version: string }>();
  for (const ms of msRows ?? []) {
    const tid = ms.tender_id as number;
    const existing = modelScoreMap.get(tid);
    if (!existing || compareVersions(ms.model_version, existing.model_version) > 0) {
      modelScoreMap.set(tid, { model_score: ms.model_score, model_version: ms.model_version });
    }
  }

  // Step 4 — Fetch analysis status for this project (indexed on project_id, tender_id).
  const { data: analysisRows, error: aError } = await supabase
    .from("tender_analysis")
    .select("tender_id, status")
    .eq("project_id", projectId)
    .in("tender_id", finalIds);

  if (aError) throw aError;

  // First status found per tender (equivalent to existing find() behavior).
  const analysisMap = new Map<number, string>();
  for (const a of analysisRows ?? []) {
    const tid = a.tender_id as number;
    if (!analysisMap.has(tid)) {
      analysisMap.set(tid, a.status);
    }
  }

  const mapped = tenderRows.map((row) => ({
    ...row,
    model_score: modelScoreMap.get(row.id)?.model_score ?? null,
    human_score_avg: null,
    analysis_status: analysisMap.get(row.id) ?? null,
    inbox_seen_at: seenAtMap.get(row.id) ?? null,
    dismissed_at: null,
  } as InboxTender));

  // Sort by model_score DESC (nulls last), then published_at DESC as tiebreaker.
  return mapped.sort((a, b) => {
    if (a.model_score !== null && b.model_score !== null) return b.model_score - a.model_score;
    if (a.model_score !== null) return -1;
    if (b.model_score !== null) return 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });
}

/** Fetch a batch of unscored tenders for the training queue.
 *  Returns up to `limit` OUTDATED tenders (past deadline) that passed the
 *  project's hard filters, have NOT yet been scored in the current training
 *  session, and are not in the provided `excludeIds` list.
 *
 *  Two-step: IDs from tender_filter_results → rows from tenders_raw. */
export async function getTrainingTenderBatch(
  projectId: string,
  excludeIds: number[] = [],
  limit = 10
): Promise<TrainingTender[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Exclude tenders scored in ANY training session, not just the current one.
  // A tender that has ever been labelled must not resurface as a training candidate.
  const { data: scoredRows } = await supabase
    .from("tender_scores")
    .select("tender_id")
    .eq("project_id", projectId)
    .limit(2000);

  const scoredIds = (scoredRows ?? []).map((r) => r.tender_id);
  const allExcluded = [...new Set([...scoredIds, ...excludeIds])];

  // Step 1 — Get passed tender IDs (oldest first — more likely to be expired).
  const { data: filterRows, error: filterError } = await supabase
    .from("tender_filter_results")
    .select("tender_id")
    .eq("project_id", projectId)
    .eq("passed", true)
    .order("tender_id", { ascending: true })
    .limit(2000);

  if (filterError) throw filterError;
  if (!filterRows || filterRows.length === 0) return [];

  const passedIds = filterRows
    .map((r) => r.tender_id)
    .filter((id) => !allExcluded.includes(id));

  if (passedIds.length === 0) return [];

  // Step 2 — Fetch expired tenders from tenders_raw.
  const { data, error } = await supabase
    .from("tenders_raw")
    .select(
      "id, title, summary, link, buyer_name, budget_amount, published_at, deadline_at, cpv, region, contract_type, procedure_type"
    )
    .in("id", passedIds)
    .lt("deadline_at", now)
    .order("deadline_at", { ascending: false })
    .limit(limit);

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
      title: t?.title ?? "(sin título)",
      cpv: t?.cpv ?? null,
      region: t?.region ?? null,
    } as ScoredTenderEntry;
  });
}
