import { createClient } from "@/lib/supabase/server";
import {
  getNextTrainingTender,
  getNextTestTender,
  getScoreDistribution,
  getScoredCount,
  getScoredTenders,
} from "@/lib/queries/tenders";
import { getProject } from "@/lib/queries/projects";
import TrainingCard from "@/components/training/TrainingCard";
import TrainingCounter from "@/components/training/TrainingCounter";
import ScoreDistributionChart from "@/components/training/ScoreDistributionChart";
import TryMeMode from "@/components/training/TryMeMode";
import ScoreHistoryByCpv from "@/components/training/ScoreHistoryByCpv";
import ResetTrainingButton from "@/components/training/ResetTrainingButton";

export const metadata = { title: "Entrenamiento — Tenderloin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mode?: string; skip?: string }>;
}

export default async function TrainingPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { mode, skip } = await searchParams;

  // Normalise mode: treat legacy "tryme" as "test"
  const activeMode = mode === "tryme" || mode === "test" ? "test" : mode === "history" ? "history" : "train";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const skipId = skip ? Number(skip) : undefined;

  const [distribution, scoredCount, project] = await Promise.all([
    getScoreDistribution(projectId, user!.id),
    getScoredCount(projectId, user!.id),
    getProject(projectId),
  ]);

  // Mode-specific fetches — only run what the current tab needs.
  const nextTender =
    activeMode === "train" ? await getNextTrainingTender(projectId, user!.id) : null;

  const testTender =
    activeMode === "test" ? await getNextTestTender(projectId, skipId) : null;

  const scoredTenders =
    activeMode === "history" ? await getScoredTenders(projectId, user!.id) : null;

  const projectName = project?.name ?? undefined;

  const tabs = [
    { id: "train", label: "Entrenar", href: `/projects/${projectId}/training` },
    { id: "test", label: "🎯 TEST THE TRAINING", href: `/projects/${projectId}/training?mode=test` },
    { id: "history", label: "Historial", href: `/projects/${projectId}/training?mode=history` },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Entrenamiento del modelo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Puntúa licitaciones de 0 a 5 para entrenar el modelo de puntuación inteligente.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={tab.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeMode === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </div>

      {/* Counter + chart — shown in train and test modes */}
      {activeMode !== "history" && (
        <div className="grid grid-cols-2 gap-4 items-start">
          <TrainingCounter count={scoredCount} />
          <ScoreDistributionChart data={distribution} />
        </div>
      )}

      {/* Mode content */}
      {activeMode === "train" && (
        <TrainingCard tender={nextTender} projectId={projectId} projectName={projectName} />
      )}

      {activeMode === "test" && (
        <TryMeMode tender={testTender} projectId={projectId} projectName={projectName} />
      )}

      {activeMode === "history" && scoredTenders !== null && (
        <ScoreHistoryByCpv tenders={scoredTenders} />
      )}

      {/* Reset button — only in train mode */}
      {activeMode === "train" && (
        <div className="flex justify-center pb-4">
          <ResetTrainingButton projectId={projectId} />
        </div>
      )}
    </div>
  );
}
