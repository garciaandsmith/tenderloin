import { cn } from "@/lib/utils";

const SCORE_STYLES: Record<number, string> = {
  0: "bg-gray-100 text-gray-600",
  1: "bg-red-100 text-red-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-yellow-100 text-yellow-700",
  4: "bg-green-100 text-green-700",
  5: "bg-blue-100 text-blue-700",
};

interface Props {
  score: number | null;
  className?: string;
}

export default function ScoreBadge({ score, className }: Props) {
  if (score === null || score === undefined) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-50 text-gray-400",
          className
        )}
      >
        —
      </span>
    );
  }

  const rounded = Math.round(score);
  const style = SCORE_STYLES[rounded] ?? SCORE_STYLES[0];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        style,
        className
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}
