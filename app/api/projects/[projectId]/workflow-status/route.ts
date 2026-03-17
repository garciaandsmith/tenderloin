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
 * Returns the status of the most recent score.yml workflow run.
 */
export async function GET(_request: Request, { params: _params }: Params) {
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

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/score.yml/runs?per_page=1`,
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
  const run = data.workflow_runs?.[0];

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
