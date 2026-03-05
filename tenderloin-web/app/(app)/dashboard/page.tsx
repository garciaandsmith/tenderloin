import { createClient } from "@/lib/supabase/server";
import { getUserProjects } from "@/lib/queries/projects";
import Link from "next/link";
import { formatDate } from "@/lib/utils/formatters";

export const metadata = { title: "Panel — Tenderloin" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const projects = await getUserProjects();

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Panel de control</h1>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {profile?.role === "admin" ? (
            <>
              <p className="mb-3">Aún no hay proyectos.</p>
              <Link
                href="/projects/new"
                className="text-primary underline underline-offset-4"
              >
                Crear el primer proyecto
              </Link>
            </>
          ) : (
            <p>No tienes proyectos asignados todavía.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}/inbox`}
              className="block rounded-lg border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="font-semibold text-lg mb-1">{project.name}</h2>
              {project.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Creado {formatDate(project.created_at)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {profile?.role === "admin" && projects.length > 0 && (
        <div className="mt-6">
          <Link
            href="/projects/new"
            className="text-sm text-primary underline underline-offset-4"
          >
            + Nuevo proyecto
          </Link>
        </div>
      )}
    </div>
  );
}
