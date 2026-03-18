import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/pipeline");
  }

  // Non-admin: redirect to first assigned project
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id, projects!inner(id, is_active)")
    .eq("user_id", user.id)
    .limit(5);

  const activeMembership = (memberships ?? []).find((m) => {
    const p = Array.isArray(m.projects) ? m.projects[0] : m.projects;
    return (p as { is_active: boolean } | null)?.is_active !== false;
  });

  if (activeMembership) {
    redirect(`/projects/${activeMembership.project_id}/inbox`);
  }

  // No active projects assigned
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4">
      <h1 className="text-xl font-semibold">Sin proyectos asignados</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Aún no tienes ningún proyecto asignado. Contacta con un administrador para que te añada a un proyecto.
      </p>
    </div>
  );
}
