import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInboxTenders } from "@/lib/queries/tenders";
import InboxList from "@/components/inbox/InboxList";

export const metadata = { title: "Bandeja de entrada — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function InboxPage({ params }: Props) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [tenders, profileResult] = await Promise.all([
    getInboxTenders(projectId),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const isAdmin = profileResult.data?.role === "admin";

  return <InboxList tenders={tenders} projectId={projectId} isAdmin={isAdmin} />;
}
