import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import TopNav from "@/components/layout/TopNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Fetch projects for sidebar: admins see all, members see their assigned projects
  let sidebarProjects: Array<{ id: string; name: string }> = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    sidebarProjects = (data ?? []) as Array<{ id: string; name: string }>;
  } else {
    const { data } = await supabase
      .from("project_members")
      .select("project_id, projects!inner(id, name)")
      .eq("user_id", user.id);
    sidebarProjects = (data ?? []).map((row) => {
      const p = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      return {
        id: (p as { id: string; name: string }).id,
        name: (p as { id: string; name: string }).name,
      };
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar profile={profile} projects={sidebarProjects} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav profile={profile} projects={sidebarProjects} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
