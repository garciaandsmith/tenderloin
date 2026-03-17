import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

export interface WorkflowStatus {
  status: "never" | "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | null;
  updated_at: string | null;
  run_url: string | null;
}

/**
 * GET /api/projects/[projectId]/workflow-status
 *
 * Returns the status of the most recent score.yml run that was triggered
 * for this specific project (or a global run with no project_id input).
 *
 * Accepts an optional `since` query param (ISO timestamp) to only return
 * runs created after that time — used by the Refresh button to track the
 * run it just triggered.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since"); // optional ISO timestamp

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub env vars not configured" },
      { status: 500 }
    );
  }

  // Fetch recent runs — enough to find one matching this project after filtering.
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/score.yml/runs?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: 502 });
  }

  const data = await response.json();
  const runs: Array<{
    status: string;
    conclusion: string | null;
    updated_at: string;
    created_at: string;
    html_url: string;
    inputs?: Record<string, string> | null;
  }> = data.workflow_runs ?? [];

  // Find the most recent run that belongs to this project:
  //   - run.inputs.project_id === projectId  (triggered for this project), OR
  //   - run.inputs is empty / null            (triggered for all projects, counts for everyone)
  // If `since` is provided, only consider runs created at or after that timestamp.
  const sinceDate = since ? new Date(since) : null;

  const run = runs.find((r) => {
    if (sinceDate && new Date(r.created_at) < sinceDate) return false;
    const runProjectId = r.inputs?.project_id ?? null;
    return !runProjectId || runProjectId === projectId;
  });

  if (!run) {
    return NextResponse.json({
      status: "never",
      conclusion: null,
      updated_at: null,
      run_url: null,
    } satisfies WorkflowStatus);
  }

  return NextResponse.json({
    status: run.status,
    conclusion: run.conclusion,
    updated_at: run.updated_at,
    run_url: run.html_url,
  } satisfies WorkflowStatus);
}
