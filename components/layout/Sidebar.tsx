"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Layers, Users, FolderOpen } from "lucide-react";
import type { Profile } from "@/lib/types/app.types";

interface Props {
  profile: Pick<Profile, "role" | "email" | "full_name"> | null;
  projects: Array<{ id: string; name: string }>;
}

export default function Sidebar({ profile, projects }: Props) {
  const pathname = usePathname();
  const isAdmin = profile?.role === "admin";

  return (
    <aside className="hidden md:flex flex-col w-56 border-r bg-card h-full overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-5 border-b">
        <span className="text-lg font-bold tracking-tight">Tenderloin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {/* Projects section — visible to all users */}
        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Proyectos
        </p>

        {projects.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground italic">
            Sin proyectos asignados
          </p>
        ) : (
          projects.map((project) => (
            <SidebarLink
              key={project.id}
              href={`/projects/${project.id}/inbox`}
              label={project.name}
              icon={<FolderOpen className="h-4 w-4 shrink-0" />}
              active={pathname.startsWith(`/projects/${project.id}`)}
            />
          ))
        )}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Admin
              </p>
            </div>
            <SidebarLink
              href="/pipeline"
              label="Pipeline"
              icon={<Layers className="h-4 w-4" />}
              active={pathname.startsWith("/pipeline")}
            />
            <SidebarLink
              href="/admin/users"
              label="Usuarios"
              icon={<Users className="h-4 w-4" />}
              active={pathname.startsWith("/admin/users")}
            />
          </>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
