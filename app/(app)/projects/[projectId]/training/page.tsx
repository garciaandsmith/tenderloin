import { createClient } from "@/lib/supabase/server";
import {
  getNextTrainingTender,
  getScoreDistribution,
  getScoredCount,
} from "@/lib/queries/tenders";
import { getProject } from "@/lib/queries/projects";
import TrainingCard from "@/components/training/TrainingCard";
import TrainingCounter from "@/components/training/TrainingCounter";
import ScoreDistributionChart from "@/components/training/ScoreDistributionChart";
import TryMeMode from "@/components/training/TryMeMode";
import ResetTrainingButton from "@/components/training/ResetTrainingButton";

export const metadata = { title: "Entrenamiento — Tenderloin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function TrainingPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { mode } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [nextTender, distribution, scoredCount, project] = await Promise.all([
    getNextTrainingTender(projectId, user!.id),
    getScoreDistribution(projectId, user!.id),
    getScoredCount(projectId, user!.id),
    getProject(projectId),
  ]);

  const projectName = project?.name ?? undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Entrenamiento del modelo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Puntúa licitaciones de 0 a 5 para entrenar el modelo de puntuación inteligente.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/projects/${projectId}/training`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode !== "tryme"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Entrenar
          </a>
          <a
            href={`/projects/${projectId}/training?mode=tryme`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "tryme"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            🎯 TRY ME
          </a>
        </div>
      </div>

      {/* Counter + chart side by side to avoid scrolling */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <TrainingCounter count={scoredCount} />
        <ScoreDistributionChart data={distribution} />
      </div>

      {mode === "tryme" ? (
        <TryMeMode tender={nextTender} projectId={projectId} projectName={projectName} />
      ) : (
        <TrainingCard tender={nextTender} projectId={projectId} projectName={projectName} />
      )}

      <div className="flex justify-center pb-4">
        <ResetTrainingButton projectId={projectId} />
      </div>
    </div>
  );
}
