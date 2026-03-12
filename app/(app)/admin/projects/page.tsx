import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAllProjects } from "@/lib/queries/projects";
import Link from "next/link";
import { formatDate } from "@/lib/utils/formatters";

export const metadata = { title: "Proyectos — Admin — Tenderloin" };

export default async function AdminProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") redirect("/pipeline");

  const projects = await getAllProjects();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Proyectos</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Nuevo proyecto
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-muted-foreground">No hay proyectos aún.</p>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold truncate">{p.name}</h2>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mb-2">{p.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Creado el {formatDate(p.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/admin/projects/${p.id}`}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    Editar
                  </Link>
                  <Link
                    href={`/projects/${p.id}/inbox`}
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    Ver proyecto
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
