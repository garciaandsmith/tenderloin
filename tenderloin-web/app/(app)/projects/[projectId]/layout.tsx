import { notFound } from "next/navigation";
import { getProject } from "@/lib/queries/projects";
import ProjectNavLink from "@/components/layout/ProjectNavLink";

interface Props {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) notFound();

  const tabs = [
    { href: `/projects/${projectId}/inbox`, label: "Bandeja de entrada" },
    { href: `/projects/${projectId}/training`, label: "Entrenamiento" },
    { href: `/projects/${projectId}/settings`, label: "Configuración" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{project.name}</h1>
        {project.description && (
          <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
        )}
      </div>

      <nav className="flex gap-1 border-b pb-0">
        {tabs.map((tab) => (
          <ProjectNavLink key={tab.href} href={tab.href} label={tab.label} />
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
}

