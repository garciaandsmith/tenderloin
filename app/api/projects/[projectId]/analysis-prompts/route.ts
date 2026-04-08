import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const MAX_PROMPT_LENGTH = 6000;

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Verify the caller is a member of this project
  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { prompt_technical, prompt_administrative } = body;

  // Validate: each prompt must be a non-empty string or null
  for (const [field, value] of [
    ["prompt_technical", prompt_technical],
    ["prompt_administrative", prompt_administrative],
  ] as const) {
    if (value !== null && value !== undefined) {
      if (typeof value !== "string") {
        return NextResponse.json(
          { error: `${field} debe ser una cadena de texto o null` },
          { status: 400 }
        );
      }
      if (value.length > MAX_PROMPT_LENGTH) {
        return NextResponse.json(
          { error: `${field} no puede superar ${MAX_PROMPT_LENGTH} caracteres` },
          { status: 400 }
        );
      }
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({
      prompt_technical: prompt_technical ?? null,
      prompt_administrative: prompt_administrative ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    console.error("Error updating analysis prompts:", error);
    return NextResponse.json({ error: "Error al guardar los prompts" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
