import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getProject, getProjectMembers } from "@/lib/queries/projects";
import { formatDate } from "@/lib/utils/formatters";
import Link from "next/link";
import ProjectEditForm from "@/components/projects/ProjectEditForm";
import MemberList from "@/components/projects/MemberList";

interface Props {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: `${project?.name ?? "Proyecto"} — Admin — Tenderloin` };
}

export default async function AdminProjectDetailPage({ params }: Props) {
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

  if (profile?.role !== "admin") redirect("/home");

  const [project, members] = await Promise.all([
    getProject(projectId),
    getProjectMembers(projectId),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/projects"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Proyectos
        </Link>
      </div>

      {/* Project info card */}
      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Editar proyecto</h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                project.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {project.is_active ? "Activo" : "Inactivo"}
            </span>
            <span className="text-xs text-muted-foreground">
              Creado el {formatDate(project.created_at)}
            </span>
          </div>
        </div>

        <ProjectEditForm
          projectId={project.id}
          initialName={project.name}
          initialDescription={project.description}
        />
      </div>

      {/* Members card */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Usuarios con acceso</h2>
        <MemberList
          projectId={project.id}
          members={members as Parameters<typeof MemberList>[0]["members"]}
        />
      </div>

      <div className="flex gap-2">
        <Link
          href={`/projects/${project.id}/inbox`}
          className="text-sm text-primary underline underline-offset-4"
        >
          Ir al proyecto →
        </Link>
      </div>
    </div>
  );
}
