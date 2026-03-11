"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function resetTrainingScores(projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Deletes all tender_scores for this project.
  // Requires migration 003 (tender_scores_delete_project_member RLS policy) to be
  // applied in Supabase — any project member can delete all project scores.
  const { error } = await supabase
    .from("tender_scores")
    .delete()
    .eq("project_id", projectId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/training`);
  return {};
}
