import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/refresh
 *
 * Clears existing model scores AND filter results for the project, then
 * triggers the score.yml workflow (filter → score).  Clearing filter results
 * forces a full re-evaluation against the current project filter config so
 * that tenders whose status changed due to filter updates are correctly
 * included or excluded when the scoring step runs.
 *
 * Admin or project member only.
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

  if (profile?.role !== "admin") {
    const { data: membership } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use the admin client for the DELETE operations: tender_model_scores and
  // tender_filter_results have no RLS DELETE policies, so the user-scoped
  // client would silently delete 0 rows (Supabase skips rows the policy does
  // not permit without returning an error).  Authorization has already been
  // verified above, so bypassing RLS here is intentional and safe.
  const adminSupabase = await createAdminClient();

  // Clear existing model scores for this project so the scoring pipeline
  // re-evaluates all active tenders with the freshly trained model.
  const { error: scoresError } = await adminSupabase
    .from("tender_model_scores")
    .delete()
    .eq("project_id", projectId);
  if (scoresError) {
    return NextResponse.json(
      { error: `Failed to clear scores: ${scoresError.message}` },
      { status: 500 }
    );
  }

  // Also clear filter results so the filter step re-evaluates ALL tenders
  // against the current project filter config.  Without this, tenders that
  // were evaluated before a filter change (and thus have stale passed=false
  // entries) would never be scored even though they now pass the updated
  // filters — causing them to appear as "Pendiente" in the inbox forever.
  const { error: filterError } = await adminSupabase
    .from("tender_filter_results")
    .delete()
    .eq("project_id", projectId);
  if (filterError) {
    return NextResponse.json(
      { error: `Failed to clear filter results: ${filterError.message}` },
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
