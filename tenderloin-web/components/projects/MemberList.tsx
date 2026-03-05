"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Member {
  user_id: string;
  assigned_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
  } | null;
}

interface Props {
  projectId: string;
  members: Member[];
}

export default function MemberList({ projectId, members }: Props) {
  const router = useRouter();
  const [newUserId, setNewUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    if (!newUserId.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: newUserId.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al añadir el miembro.");
    } else {
      setNewUserId("");
      router.refresh();
    }
    setLoading(false);
  }

  async function removeMember(userId: string) {
    setLoading(true);
    await fetch(`/api/projects/${projectId}/members?user_id=${userId}`, {
      method: "DELETE",
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Nombre</th>
              <th className="px-4 py-2 text-left font-medium">Rol</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.user_id} className="bg-card">
                <td className="px-4 py-2">{m.profiles?.email ?? m.user_id}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {m.profiles?.role ?? "user"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => removeMember(m.user_id)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                  No hay miembros asignados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="UUID del usuario a añadir"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          className="max-w-xs font-mono text-xs"
        />
        <Button onClick={addMember} disabled={loading} size="sm">
          Añadir
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Obtén el UUID de usuario desde el panel de Supabase → Authentication → Users.
      </p>
    </div>
  );
}
