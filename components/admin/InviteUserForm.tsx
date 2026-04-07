"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Error al invitar al usuario.");
    } else {
      setSuccess(`Invitación enviada a ${data.email}.`);
      setEmail("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleInvite} className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Invitar nuevo usuario</Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="usuario@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-72"
          required
        />
      </div>
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Enviando…" : "Enviar invitación"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
    </form>
  );
}
