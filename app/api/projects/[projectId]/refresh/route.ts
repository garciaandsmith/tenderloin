import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/refresh
 *
 * Clears existing model scores for the project (so the scoring step
 * re-scores ALL active tenders with the freshly trained model), then
 * triggers the score.yml workflow.  Filter results are kept intact so
 * the filter step only evaluates genuinely new tenders.
 *
 * Admin-only.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Clear existing model scores for this project so the scoring pipeline
  // re-evaluates all active tenders with the freshly trained model.
  // Filter results are intentionally preserved — the filter step will only
  // process tenders it has not yet evaluated (incremental).
  const { error: scoresError } = await supabase
    .from("tender_model_scores")
    .delete()
    .eq("project_id", projectId);
  if (scoresError) {
    return NextResponse.json(
      { error: `Failed to clear scores: ${scoresError.message}` },
      { status: 500 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub env vars not configured (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/score.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { project_id: projectId } }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `GitHub API error: ${text}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
