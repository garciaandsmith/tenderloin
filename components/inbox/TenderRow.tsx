"use client";

import { useRouter } from "next/navigation";
import { formatBudget, formatDate, daysUntil } from "@/lib/utils/formatters";
import ScoreBadge from "./ScoreBadge";
import type { InboxTender } from "@/lib/types/app.types";
import { cn } from "@/lib/utils";
import { Star, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface Props {
  tender: InboxTender;
  projectId: string;
  isFavorited: boolean;
  onToggleFavorite: (id: number) => void;
}

function AnalysisBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const configs: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    done: {
      label: "Procesado",
      className: "bg-green-100 text-green-700 border-green-200",
      Icon: CheckCircle,
    },
    running: {
      label: "Procesando",
      className: "bg-blue-100 text-blue-700 border-blue-200",
      Icon: Loader2,
    },
    pending: {
      label: "En cola",
      className: "bg-amber-100 text-amber-700 border-amber-200",
      Icon: Clock,
    },
    error: {
      label: "Error",
      className: "bg-red-100 text-red-700 border-red-200",
      Icon: AlertCircle,
    },
  };

  const config = configs[status];
  if (!config) return null;
  const { label, className, Icon } = config;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        className
      )}
    >
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {label}
    </span>
  );
}

export default function TenderRow({ tender, projectId, isFavorited, onToggleFavorite }: Props) {
  const router = useRouter();
  const deadline = daysUntil(tender.deadline_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${projectId}/inbox/${tender.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          router.push(`/projects/${projectId}/inbox/${tender.id}`);
        }
      }}
      className="flex items-start gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      {/* Score badge */}
      <div className="shrink-0 w-12 pt-0.5">
        <ScoreBadge score={tender.model_score} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug line-clamp-2">{tender.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-muted-foreground truncate">{tender.buyer_name}</p>
          <AnalysisBadge status={tender.analysis_status} />
        </div>
      </div>

      {/* Right side: budget + deadline (with fixed widths matching headers) */}
      <div className="shrink-0 w-24 text-right">
        <p className="text-xs font-medium">{formatBudget(tender.budget_amount)}</p>
      </div>

      <div className="shrink-0 w-20 text-right">
        <p
          className={cn(
            "text-xs",
            deadline.expired
              ? "text-destructive"
              : deadline.urgent
              ? "text-amber-600"
              : "text-muted-foreground"
          )}
        >
          {formatDate(tender.deadline_at)}
        </p>
      </div>

      {/* Published date — hidden on small screens */}
      <div className="hidden lg:block shrink-0 text-xs text-muted-foreground w-20 text-right">
        {formatDate(tender.published_at)}
      </div>

      {/* Favorite star — stop propagation to avoid navigating */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(tender.id);
        }}
        className={cn(
          "shrink-0 p-1 rounded transition-colors hover:text-amber-500",
          isFavorited ? "text-amber-400" : "text-muted-foreground/40"
        )}
        aria-label={isFavorited ? "Quitar de favoritos" : "Añadir a favoritos"}
      >
        <Star className={cn("h-4 w-4", isFavorited && "fill-amber-400")} />
      </button>
    </div>
  );
}
