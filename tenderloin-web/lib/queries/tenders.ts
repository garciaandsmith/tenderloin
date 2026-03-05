import { createClient } from "@/lib/supabase/server";
import type { InboxTender, ScoreDistribution, TrainingTender } from "@/lib/types/app.types";

/** Fetch tenders that pass the project's hard filters, have a future deadline,
 *  and are ordered by model score (desc). Used in the Inbox. */
export async function getInboxTenders(projectId: string): Promise<InboxTender[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenders_raw")
    .select(
      `
      *,
      tender_filter_results!inner ( passed, project_id ),
      tender_model_scores ( model_score, project_id, model_version )
    `
    )
    .eq("tender_filter_results.project_id", projectId)
    .eq("tender_filter_results.passed", true)
    .gt("deadline_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
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

    const { tender_filter_results: _tfr, tender_model_scores: _tms, ...tender } = row as Record<string, unknown>;
    void _tfr; void _tms;

    return {
      ...(tender as Parameters<typeof Object.assign>[0]),
      model_score: projectModelScore?.model_score ?? null,
      human_score_avg: null,
    } as InboxTender;
  });
}

/** Fetch the next unscored tender for the training queue.
 *  Returns tenders that pass hard filters but have NOT yet been scored by this user. */
export async function getNextTrainingTender(
  projectId: string,
  userId: string
): Promise<TrainingTender | null> {
  const supabase = await createClient();

  // Subquery-style: get already-scored tender IDs for this user/project
  const { data: scoredRows } = await supabase
    .from("tender_scores")
    .select("tender_id")
    .eq("project_id", projectId)
    .eq("scored_by", userId);

  const scoredIds = (scoredRows ?? []).map((r) => r.tender_id);

  let query = supabase
    .from("tenders_raw")
    .select("id, title, summary, buyer_name, budget_amount, published_at, tender_filter_results!inner ( passed, project_id )")
    .eq("tender_filter_results.project_id", projectId)
    .eq("tender_filter_results.passed", true)
    .order("published_at", { ascending: false })
    .limit(1);

  if (scoredIds.length > 0) {
    query = query.not("id", "in", `(${scoredIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  const { tender_filter_results: _tfr, ...tender } = row;
  void _tfr;

  return tender as TrainingTender;
}

/** Fetch the score distribution (count per score 0-5) for a project.
 *  Used in the training section chart. */
export async function getScoreDistribution(projectId: string): Promise<ScoreDistribution[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tender_scores")
    .select("score")
    .eq("project_id", projectId);

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

/** Count total tenders scored in a project. */
export async function getScoredCount(projectId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("tender_scores")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) throw error;
  return count ?? 0;
}
