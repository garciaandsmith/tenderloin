import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function SettingsRedirectPage({ params }: Props) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/configuration`);
}
