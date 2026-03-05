import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils/formatters";
import PipelineTriggerButton from "@/components/admin/PipelineTriggerButton";

export const metadata = { title: "Pipeline — Admin — Tenderloin" };
export const dynamic = "force-dynamic";

export default async function AdminPipelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: stateRow } = await supabase
    .from("pipeline_state")
    .select("value, updated_at")
    .eq("key", "capture.last_successful_run_at")
    .maybeSingle();

  const { count: totalTenders } = await supabase
    .from("tenders_raw")
    .select("*", { count: "exact", head: true });

  const lastRun = stateRow?.value ? new Date(stateRow.value) : null;
  const now = new Date();
  const hoursAgo = lastRun
    ? Math.round((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60))
    : null;

  const isStale = hoursAgo !== null && hoursAgo > 25;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Estado del pipeline</h1>

      {isStale && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          ⚠️ El último pipeline se ejecutó hace {hoursAgo} horas. Considera ejecutarlo manualmente.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Última captura"
          value={lastRun ? formatDate(lastRun.toISOString()) : "Nunca"}
          sub={hoursAgo !== null ? `Hace ${hoursAgo}h` : undefined}
        />
        <StatCard
          label="Total licitaciones"
          value={totalTenders?.toLocaleString("es-ES") ?? "—"}
        />
      </div>

      <div>
        <h2 className="font-semibold mb-3">Ejecución manual</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Dispara el workflow de GitHub Actions para capturar licitaciones ahora mismo. Requiere
          configurar <code className="text-xs bg-muted px-1 rounded">GITHUB_TOKEN</code>,{" "}
          <code className="text-xs bg-muted px-1 rounded">GITHUB_OWNER</code> y{" "}
          <code className="text-xs bg-muted px-1 rounded">GITHUB_REPO</code> en las variables de
          entorno de Vercel.
        </p>
        <PipelineTriggerButton />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
