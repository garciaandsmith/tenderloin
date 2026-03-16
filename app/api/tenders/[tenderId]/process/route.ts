import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ tenderId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { tenderId } = await params;
  const { projectId, analysisType } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  }

  if (!analysisType || !["technical", "administrative"].includes(analysisType)) {
    return NextResponse.json(
      { error: "analysisType debe ser 'technical' o 'administrative'" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenderIdNum = Number(tenderId);
  if (isNaN(tenderIdNum)) {
    return NextResponse.json({ error: "ID de licitación inválido" }, { status: 400 });
  }

  // Check that the tender exists
  const { data: tender } = await supabase
    .from("tenders_raw")
    .select("id")
    .eq("id", tenderIdNum)
    .single();

  if (!tender) {
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });
  }

  // Upsert a pending analysis record for this type (reset if previously errored)
  const { error } = await supabase
    .from("tender_analysis")
    .upsert(
      {
        tender_id: tenderIdNum,
        analysis_type: analysisType,
        project_id: projectId,
        triggered_by: user.id,
        status: "pending",
        key_data_summary: null,
        services_required: null,
        technical_conditions: null,
        administrative_conditions: null,
        attached_files: null,
        raw_llm_output: null,
        triggered_at: new Date().toISOString(),
        completed_at: null,
      },
      { onConflict: "tender_id,analysis_type" }
    );

  if (error) {
    console.error("Error creating tender analysis:", error);
    return NextResponse.json({ error: "Error al crear el análisis" }, { status: 500 });
  }

  // Dispatch the analysis workflow immediately (best-effort — don't fail the request if GitHub is unreachable)
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (token && owner && repo) {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/analysis.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { analysis_type: analysisType } }),
      }
    ).catch((err) => console.error("Failed to dispatch analysis workflow:", err));
  }

  return NextResponse.json({ ok: true });
}
