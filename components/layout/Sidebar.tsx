"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FolderOpen, Users, Activity } from "lucide-react";
import type { Profile } from "@/lib/types/app.types";

interface Props {
  profile: Pick<Profile, "role" | "email" | "full_name"> | null;
}

const navItems = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/projects", label: "Proyectos", icon: FolderOpen, adminOnly: true },
];

const adminItems = [
  { href: "/admin/users", label: "Usuarios", icon: Users },
  { href: "/admin/pipeline", label: "Pipeline", icon: Activity },
];

export default function Sidebar({ profile }: Props) {
  const pathname = usePathname();
  const isAdmin = profile?.role === "admin";

  return (
    <aside className="hidden md:flex flex-col w-56 border-r bg-card h-full overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-5 border-b">
        <span className="text-lg font-bold tracking-tight">🥩 Tenderloin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={<item.icon className="h-4 w-4" />}
              active={pathname.startsWith(item.href)}
            />
          ))}

        {isAdmin && (
          <>
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Admin
            </p>
            {adminItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={<item.icon className="h-4 w-4" />}
                active={pathname.startsWith(item.href)}
              />
            ))}
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
      {label}
    </Link>
  );
}
