import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectFilters } from "@/lib/types/app.types";

/** Fetch all projects visible to the current user. */
export async function getUserProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Fetch a single project by ID. */
export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) return null;
  return data;
}

/** Fetch the hard filter settings for a project. */
export async function getProjectFilters(projectId: string): Promise<ProjectFilters | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_filters")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Fetch project members with profile details. */
export async function getProjectMembers(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("*, profiles(*)")
    .eq("project_id", projectId);

  if (error) throw error;
  return data ?? [];
}
