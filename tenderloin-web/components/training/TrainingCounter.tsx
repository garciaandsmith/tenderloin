interface Props {
  count: number;
}

const MILESTONES = [10, 25, 50, 100, 250, 500];

function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => m > count) ?? null;
}

export default function TrainingCounter({ count }: Props) {
  const next = nextMilestone(count);
  const pct = next ? Math.min(100, Math.round((count / next) * 100)) : 100;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Licitaciones puntuadas</p>
          <p className="text-3xl font-bold mt-0.5">{count.toLocaleString("es-ES")}</p>
        </div>
        {next && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Próximo hito</p>
            <p className="text-lg font-semibold">{next}</p>
          </div>
        )}
      </div>
      {next && (
        <div className="mt-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-right">{pct}%</p>
        </div>
      )}
    </div>
  );
}
