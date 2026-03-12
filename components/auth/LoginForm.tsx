"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setMessage("Cuenta creada. Revisa tu email para confirmarla, luego inicia sesión.");
      setMode("signin");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Credenciales incorrectas. Inténtalo de nuevo.");
      setLoading(false);
      return;
    }

    router.push("/pipeline");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl mb-2">🥩</div>
          <h1 className="text-2xl font-bold">Tenderloin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoreo inteligente de licitaciones
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? mode === "signup" ? "Creando cuenta…" : "Iniciando sesión…"
              : mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              ¿Sin cuenta?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
                className="underline hover:text-foreground"
              >
                Crear una
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setMessage(null); }}
                className="underline hover:text-foreground"
              >
                Iniciar sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
