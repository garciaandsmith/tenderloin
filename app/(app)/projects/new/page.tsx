import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProjectCreateForm from "@/components/projects/ProjectCreateForm";

export const metadata = { title: "Nuevo proyecto — Tenderloin" };

export default async function NewProjectPage() {
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

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Nuevo proyecto</h1>
      <ProjectCreateForm />
    </div>
  );
}
