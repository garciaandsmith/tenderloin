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

  // Verify the caller is a member of the project they are submitting on behalf of.
  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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

  // Guard: verify the project has a configured prompt for this analysis type
  const { data: project } = await supabase
    .from("projects")
    .select("prompt_technical, prompt_administrative")
    .eq("id", projectId)
    .single();

  const prompt =
    analysisType === "technical"
      ? project?.prompt_technical
      : project?.prompt_administrative;

  if (!prompt) {
    return NextResponse.json(
      {
        error:
          "El prompt de análisis no está configurado para este proyecto. " +
          "Configúralo en la página de Configuración del proyecto antes de lanzar el análisis.",
      },
      { status: 422 }
    );
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
        services_required: null,
        administrative_conditions: null,
        attached_files: null,
        raw_llm_output: null,
        triggered_at: new Date().toISOString(),
        completed_at: null,
      },
      { onConflict: "tender_id,analysis_type,project_id" }
    );

  if (error) {
    console.error("Error creating tender analysis:", error);
    return NextResponse.json({ error: "Error al crear el análisis" }, { status: 500 });
  }

  // Dispatch the analysis workflow
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  async function revertToError(message: string) {
    await supabase
      .from("tender_analysis")
      .update({ status: "error", raw_llm_output: { error: message } })
      .eq("tender_id", tenderIdNum)
      .eq("analysis_type", analysisType)
      .eq("project_id", projectId);
  }

  if (!token || !owner || !repo) {
    const msg = "GitHub workflow env vars (GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO) are not set.";
    console.error(msg);
    await revertToError(msg);
    return NextResponse.json(
      { error: "El servidor no está configurado para lanzar el análisis automáticamente. Contacta con el administrador." },
      { status: 503 }
    );
  }

  try {
    const ghResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/analysis.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { analysis_type: analysisType, project_id: projectId } }),
      }
    );
    if (!ghResp.ok) {
      const body = await ghResp.text().catch(() => "");
      const msg = `GitHub workflow dispatch failed (${ghResp.status}): ${body}`;
      console.error(msg);
      await revertToError(msg);
      return NextResponse.json(
        { error: `No se pudo lanzar el análisis (GitHub ${ghResp.status}). Revisa los logs del servidor.` },
        { status: 502 }
      );
    }
  } catch (err) {
    const msg = `Network error dispatching analysis workflow: ${err}`;
    console.error(msg);
    await revertToError(msg);
    return NextResponse.json(
      { error: "No se pudo contactar con GitHub para lanzar el análisis." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
