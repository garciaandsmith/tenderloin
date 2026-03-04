import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ tenderId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { tenderId } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("tender_model_scores")
    .select("model_score, model_version, scored_at")
    .eq("tender_id", Number(tenderId))
    .eq("project_id", projectId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ model_score: data?.model_score ?? null });
}
