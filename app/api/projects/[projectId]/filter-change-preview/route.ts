import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/filter-change-preview
 *
 * Returns counts to show in the confirmation modal before saving new filters:
 *   - current_scores: total training scores in the current session
 *   - current_passed: tenders currently passing the filter
 *
 * The Python backfill will re-evaluate all tenders with the new filter after
 * saving.  The migrate_training_scores() SQL function will carry forward scores
 * for tenders that still pass; the rest are archived in the old session.
 *
 * We intentionally do NOT pre-compute migrated vs. archived counts here because
 * that would require re-running the full filter logic in TypeScript.  The counts
 * returned are enough to give the user a meaningful warning.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify membership
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

  // Get current training session
  const { data: project } = await supabase
    .from("projects")
    .select("training_session")
    .eq("id", projectId)
    .single();

  const trainingSession = project?.training_session ?? 1;

  // Count scores in current training session
  const { count: currentScores } = await supabase
    .from("tender_scores")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("training_session", trainingSession);

  // Count currently passing tenders
  const { count: currentPassed } = await supabase
    .from("tender_filter_results")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("passed", true);

  return NextResponse.json({
    current_scores: currentScores ?? 0,
    current_passed: currentPassed ?? 0,
    training_session: trainingSession,
  });
}
