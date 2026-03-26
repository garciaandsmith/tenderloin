import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description } = body as { name: string; description?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), description: description?.trim() ?? null, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-add the creating admin as a member
  await supabase
    .from("project_members")
    .insert({ project_id: data.id, user_id: user.id });

  // Backfill all historical tenders through the (currently empty) filter for this project.
  // Errors are non-fatal — the daily filter.yml will also pick it up.
  try {
    await dispatchWorkflow("backfill.yml", { project_id: data.id });
  } catch {
    // log but don't fail the project creation response
  }

  return NextResponse.json(data, { status: 201 });
}
