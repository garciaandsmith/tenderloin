import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ tenderId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { tenderId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { project_id, score } = body as { project_id: string; score: number };

  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (score === undefined || score < 0 || score > 5) {
    return NextResponse.json({ error: "score must be 0–5" }, { status: 400 });
  }

  // Fetch the project's current training session so this score is attached to it.
  const { data: project } = await supabase
    .from("projects")
    .select("training_session")
    .eq("id", project_id)
    .single();

  const training_session = project?.training_session ?? 1;

  const { data, error } = await supabase
    .from("tender_scores")
    .upsert(
      {
        tender_id: Number(tenderId),
        project_id,
        scored_by: user.id,
        score: Math.round(score),
        scored_at: new Date().toISOString(),
        training_session,
      },
      { onConflict: "tender_id,project_id,scored_by,training_session" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
