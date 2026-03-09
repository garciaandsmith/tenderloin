"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface UserRoleToggleProps {
  userId: string;
  currentRole: string;
  isSelf: boolean;
}

export default function UserRoleToggle({ userId, currentRole, isSelf }: UserRoleToggleProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleRole() {
    setLoading(true);
    setError(null);
    const newRole = currentRole === "admin" ? "user" : "admin";

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al actualizar el rol.");
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">(tú)</span>;
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="outline" size="sm" onClick={toggleRole} disabled={loading}>
        {loading ? "…" : currentRole === "admin" ? "Quitar admin" : "Hacer admin"}
      </Button>
    </span>
  );
}
