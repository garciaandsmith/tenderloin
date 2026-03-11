"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function resetTrainingScores(projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Configuración incompleta: SUPABASE_SERVICE_ROLE_KEY no está definida en el entorno del servidor." };
  }

  const admin = await createAdminClient();

  // Fetch the current session so we can increment it.
  const { data: project, error: fetchError } = await admin
    .from("projects")
    .select("training_session")
    .eq("id", projectId)
    .single();

  if (fetchError || !project) {
    return { error: fetchError?.message ?? "Proyecto no encontrado" };
  }

  // Increment training_session — old scores are preserved but ignored by all
  // queries that filter by the current session.
  const { error } = await admin
    .from("projects")
    .update({ training_session: project.training_session + 1 })
    .eq("id", projectId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/training`);
  return {};
}
