import { getInboxTenders } from "@/lib/queries/tenders";
import InboxList from "@/components/inbox/InboxList";

export const metadata = { title: "Bandeja de entrada — Tenderloin" };

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function InboxPage({ params }: Props) {
  const { projectId } = await params;
  const tenders = await getInboxTenders(projectId);

  return <InboxList tenders={tenders} projectId={projectId} />;
}
