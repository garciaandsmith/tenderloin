"use client";

interface Props {
  onScore: (score: number) => void;
  disabled?: boolean;
  selected?: number | null;
  projectName?: string;
  compact?: boolean;
}

const SCORES = [
  { value: 0, label: "0", hint: "REVISAR", color: "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200" },
  { value: 1, label: "1", hint: "NULA", color: "bg-red-50 text-red-700 hover:bg-red-100 border-red-200" },
  { value: 2, label: "2", hint: "ESCASA", color: "bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200" },
  { value: 3, label: "3", hint: "SUFICIENTE", color: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200" },
  { value: 4, label: "4", hint: "BUENA", color: "bg-green-50 text-green-700 hover:bg-green-100 border-green-200" },
  { value: 5, label: "5", hint: "EXCELENTE", color: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200" },
];

export default function ScoreButtons({ onScore, disabled = false, selected, projectName, compact = false }: Props) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2 text-center">
        ¿Qué relevancia tiene esta licitación para {projectName ?? "este proyecto"}?
      </p>
      <div className="flex gap-1.5 justify-center">
        {SCORES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onScore(s.value)}
            disabled={disabled}
            title={s.hint}
            className={`flex flex-col items-center rounded-lg border font-bold transition-all
              ${compact ? "px-2 py-1.5 text-xs" : "px-4 py-3 text-sm"}
              ${s.color}
              ${selected === s.value ? "ring-2 ring-offset-1 ring-current scale-105" : ""}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className={compact ? "text-base" : "text-xl"}>{s.label}</span>
            <span className="text-xs font-normal mt-0.5">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
