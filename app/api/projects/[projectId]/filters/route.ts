import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

interface Params {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_filters")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

export async function PUT(request: Request, { params }: Params) {
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

  // Admins can update any project's filters; regular users must be a project member.
  if (profile?.role !== "admin") {
    const { data: membership } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Use service-role client for writes — the permission check above already
  // enforces that only admins and project members can reach this point.
  const adminSupabase = await createAdminClient();

  const { data, error } = await adminSupabase
    .from("project_filters")
    .upsert(
      {
        project_id: projectId,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment filter_version on the saved row
  await adminSupabase
    .from("project_filters")
    .update({ filter_version: (data.filter_version ?? 1) + 1 })
    .eq("project_id", projectId);

  // Get current training session before incrementing (needed for score migration)
  const { data: projectRow } = await adminSupabase
    .from("projects")
    .select("training_session")
    .eq("id", projectId)
    .single();
  const fromSession = projectRow?.training_session ?? 1;

  // Increment training_session atomically and get the new value
  const { data: newSessionData } = await adminSupabase
    .rpc("increment_training_session", { p_project_id: projectId });
  const toSession = (newSessionData as number | null) ?? fromSession + 1;

  // Migrate scores for tenders that still pass to the new training session
  await adminSupabase.rpc("migrate_training_scores", {
    p_project_id: projectId,
    p_from_session: fromSession,
    p_to_session: toSession,
  });

  // Dispatch backfill workflow to re-evaluate all tenders with the new filter
  await dispatchWorkflow("backfill.yml", { project_id: projectId });

  return NextResponse.json({ ...data, training_session: toSession });
}
