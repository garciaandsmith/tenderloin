import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserProjects } from "@/lib/queries/projects";
import Link from "next/link";
import { formatDate } from "@/lib/utils/formatters";

export const metadata = { title: "Proyectos — Tenderloin" };

export default async function ProjectsPage() {
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

  const projects = await getUserProjects();

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
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Descripción</th>
                <th className="px-4 py-3 text-left font-medium">Creado</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map((p) => (
                <tr key={p.id} className="bg-card">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {p.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/projects/${p.id}/configuration`}
                      className="text-primary underline underline-offset-4 text-xs"
                    >
                      Configurar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
