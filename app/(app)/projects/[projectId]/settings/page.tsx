import { createClient } from "@/lib/supabase/server";
import { getProject, getProjectFilters, getProjectMembers } from "@/lib/queries/projects";
import { notFound } from "next/navigation";
import ProjectFiltersForm from "@/components/filters/ProjectFiltersForm";
import MemberList from "@/components/projects/MemberList";

export const metadata = { title: "Configuración — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: Props) {
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

  const [project, filters, members] = await Promise.all([
    getProject(projectId),
    getProjectFilters(projectId),
    getProjectMembers(projectId),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-4">Filtros duros</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Define los criterios obligatorios que deben cumplir las licitaciones para aparecer en la
          bandeja de entrada y en el entrenamiento.
        </p>
        <ProjectFiltersForm
          projectId={projectId}
          initialFilters={filters}
          readOnly={!isAdmin}
        />
      </section>

      {isAdmin && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Usuarios del proyecto</h2>
          <MemberList
            projectId={projectId}
            members={members as Parameters<typeof MemberList>[0]["members"]}
          />
        </section>
      )}
    </div>
  );
}
