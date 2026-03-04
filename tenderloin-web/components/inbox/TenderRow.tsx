import Link from "next/link";
import { formatBudget, formatDate, daysUntil } from "@/lib/utils/formatters";
import ScoreBadge from "./ScoreBadge";
import type { InboxTender } from "@/lib/types/app.types";
import { cn } from "@/lib/utils";

interface Props {
  tender: InboxTender;
  projectId: string;
}

export default function TenderRow({ tender, projectId }: Props) {
  const deadline = daysUntil(tender.deadline_at);

  return (
    <Link
      href={`/projects/${projectId}/inbox/${tender.id}`}
      className="flex items-start gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      {/* Score badge */}
      <div className="shrink-0 pt-0.5">
        <ScoreBadge score={tender.model_score} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug line-clamp-2">{tender.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{tender.buyer_name}</p>
      </div>

      {/* Right side: budget + deadline */}
      <div className="shrink-0 text-right space-y-1">
        <p className="text-xs font-medium">{formatBudget(tender.budget_amount)}</p>
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
          {deadline.label}
        </p>
      </div>

      {/* Published date — hidden on small screens */}
      <div className="hidden lg:block shrink-0 text-xs text-muted-foreground w-20 text-right">
        {formatDate(tender.published_at)}
      </div>
    </Link>
  );
}
