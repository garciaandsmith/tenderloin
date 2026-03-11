"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function resetTrainingScores(projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("tender_scores")
    .delete()
    .eq("project_id", projectId)
    .eq("scored_by", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/training`);
  return {};
}
