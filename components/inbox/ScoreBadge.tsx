import { cn } from "@/lib/utils";

const SCORE_STYLES: Record<number, string> = {
  0: "bg-gray-100 text-gray-600",
  1: "bg-red-100 text-red-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-yellow-100 text-yellow-700",
  4: "bg-green-100 text-green-700",
  5: "bg-blue-100 text-blue-700",
};

const SCORE_LABELS: Record<number, string> = {
  0: "Revisar",
  1: "Nada",
  2: "Poco",
  3: "Dudoso",
  4: "Bueno",
  5: "Ideal",
};

interface Props {
  score: number | null;
  className?: string;
}

export default function ScoreBadge({ score, className }: Props) {
  if (score === null || score === undefined) {
    return (
      <span
        title="Sin puntuación del modelo"
        className={cn(
          "inline-flex flex-col items-center rounded-lg px-2 py-0.5 text-xs font-semibold bg-gray-50 text-gray-400 border border-dashed border-gray-200",
          className
        )}
      >
        <span className="leading-none">—</span>
        <span className="text-[9px] font-normal leading-tight mt-0.5">Pendiente</span>
      </span>
    );
  }

  const rounded = Math.round(score);
  const style = SCORE_STYLES[rounded] ?? SCORE_STYLES[0];
  const label = SCORE_LABELS[rounded] ?? "";

  return (
    <span
      title={`Puntuación del modelo: ${score.toFixed(1)} — ${label}`}
      className={cn(
        "inline-flex flex-col items-center rounded-lg px-2 py-0.5 text-xs font-bold",
        style,
        className
      )}
    >
      <span className="leading-none">{score.toFixed(1)}</span>
      <span className="text-[9px] font-normal leading-tight mt-0.5">{label}</span>
    </span>
  );
}
