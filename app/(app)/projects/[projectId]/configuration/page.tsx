import { createClient } from "@/lib/supabase/server";
import { getProject, getProjectMembers } from "@/lib/queries/projects";
import { notFound } from "next/navigation";
import ProjectEditForm from "@/components/projects/ProjectEditForm";
import MemberList from "@/components/projects/MemberList";

export const metadata = { title: "Configuración — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectConfigurationPage({ params }: Props) {
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

  const [project, members] = await Promise.all([
    getProject(projectId),
    getProjectMembers(projectId),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {isAdmin && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Información del proyecto</h2>
          <ProjectEditForm
            projectId={project.id}
            initialName={project.name}
            initialDescription={project.description}
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-4">Usuarios con acceso</h2>
        <MemberList
          projectId={projectId}
          members={members as Parameters<typeof MemberList>[0]["members"]}
          readOnly={!isAdmin}
        />
      </section>
    </div>
  );
}
