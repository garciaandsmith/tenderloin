import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/retrain
 *
 * Triggers the `retrain.yml` GitHub Actions workflow for the given project.
 * Called manually from the training UI after the user has finished a scoring
 * session, replacing the previous per-vote fire-and-forget dispatch.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params;

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
      { error: "GitHub env vars not configured (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/retrain.yml/dispatches`,
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
