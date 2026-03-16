import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/rescore
 *
 * Clears existing filter results and model scores for the given project so
 * the scoring pipeline will re-evaluate all tenders from scratch, then
 * triggers the `score.yml` GitHub Actions workflow.
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

  // Verify the project exists and is accessible
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Clear existing model scores for this project so the pipeline re-scores them
  const { error: scoresError } = await supabase
    .from("tender_model_scores")
    .delete()
    .eq("project_id", projectId);
  if (scoresError) {
    return NextResponse.json({ error: `Failed to clear scores: ${scoresError.message}` }, { status: 500 });
  }

  // Clear existing filter results for this project so the pipeline re-filters them
  const { error: filterError } = await supabase
    .from("tender_filter_results")
    .delete()
    .eq("project_id", projectId);
  if (filterError) {
    return NextResponse.json({ error: `Failed to clear filter results: ${filterError.message}` }, { status: 500 });
  }

  // Trigger the score.yml GitHub Actions workflow
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
      body: JSON.stringify({
        ref: "main",
        inputs: { project_id: projectId },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `GitHub API error: ${text}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
