"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types/app.types";
import { LogOut, User } from "lucide-react";
import MobileNav from "./MobileNav";

interface Props {
  profile: Pick<Profile, "email" | "full_name" | "role"> | null;
  projects: Array<{ id: string; name: string }>;
}

export default function TopNav({ profile, projects }: Props) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b bg-card h-14 shrink-0">
      <MobileNav profile={profile} projects={projects} />
      <div className="md:hidden font-bold text-base">🥩 Tenderloin</div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{profile?.full_name ?? profile?.email ?? "Usuario"}</span>
          {profile?.role === "admin" && (
            <span className="rounded-full bg-purple-100 text-purple-700 text-xs px-2 py-0.5 font-medium">
              admin
            </span>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
