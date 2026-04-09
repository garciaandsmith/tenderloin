"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, X, Layers, Users, FolderOpen, LayoutGrid } from "lucide-react";
import type { Profile } from "@/lib/types/app.types";

interface Props {
  profile: Pick<Profile, "role" | "email" | "full_name"> | null;
  projects: Array<{ id: string; name: string }>;
}

export default function MobileNav({ profile, projects }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-64 bg-card border-r z-50 flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b">
          <span className="text-lg font-bold tracking-tight">Tenderloin</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Proyectos
          </p>

          {projects.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">
              Sin proyectos asignados
            </p>
          ) : (
            projects.map((project) => (
              <NavLink
                key={project.id}
                href={`/projects/${project.id}/inbox`}
                label={project.name}
                icon={<FolderOpen className="h-4 w-4 shrink-0" />}
                active={pathname.startsWith(`/projects/${project.id}`)}
                onClick={() => setOpen(false)}
              />
            ))
          )}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1">
                <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Admin
                </p>
              </div>
              <NavLink
                href="/pipeline"
                label="Pipeline"
                icon={<Layers className="h-4 w-4 shrink-0" />}
                active={pathname.startsWith("/pipeline")}
                onClick={() => setOpen(false)}
              />
              <NavLink
                href="/admin/users"
                label="Usuarios"
                icon={<Users className="h-4 w-4 shrink-0" />}
                active={pathname.startsWith("/admin/users")}
                onClick={() => setOpen(false)}
              />
              <NavLink
                href="/admin/projects"
                label="Proyectos"
                icon={<LayoutGrid className="h-4 w-4 shrink-0" />}
                active={pathname.startsWith("/admin/projects")}
                onClick={() => setOpen(false)}
              />
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
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
