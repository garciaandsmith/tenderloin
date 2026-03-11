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
  const { error } = await admin
    .from("tender_scores")
    .delete()
    .eq("project_id", projectId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/training`);
  return {};
}
