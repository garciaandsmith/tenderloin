import { createClient } from "@/lib/supabase/server";
import { getProject, getProjectFilters } from "@/lib/queries/projects";
import { notFound } from "next/navigation";
import ProjectFiltersForm from "@/components/filters/ProjectFiltersForm";

export const metadata = { title: "Filtros — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectFiltrosPage({ params }: Props) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const [project, filters] = await Promise.all([
    getProject(projectId),
    getProjectFilters(projectId),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Filtros duros</h2>
        <p className="text-sm text-muted-foreground">
          Define los criterios obligatorios que deben cumplir las licitaciones para aparecer en la
          bandeja de entrada y en el entrenamiento.
        </p>
      </div>
      <ProjectFiltersForm
        projectId={projectId}
        initialFilters={filters}
        readOnly={!isAdmin}
      />
    </div>
  );
}
