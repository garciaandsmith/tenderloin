import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/refresh
 *
 * Triggers the score.yml workflow to (re-)score active tenders for this project.
 * The scoring pipeline is now additive and idempotent: it skips tenders already
 * scored with the current model version, so no scores need to be deleted first.
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

  try {
    await dispatchWorkflow("score.yml", { project_id: projectId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
