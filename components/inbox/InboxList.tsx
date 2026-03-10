import type { InboxTender } from "@/lib/types/app.types";
import TenderRow from "./TenderRow";
import { Inbox } from "lucide-react";

interface Props {
  tenders: InboxTender[];
  projectId: string;
}

export default function InboxList({ tenders, projectId }: Props) {
  if (tenders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Inbox className="h-12 w-12 mb-4 opacity-30" />
        <p className="font-medium">Bandeja vacía</p>
        <p className="text-sm mt-1">
          No hay licitaciones que cumplan los filtros del proyecto con plazo activo.
        </p>
        <p className="text-xs mt-3">
          Comprueba los filtros en <strong>Configuración</strong> o espera a la siguiente captura.
        </p>
      </div>
    );
  }

  const scoredCount = tenders.filter((t) => t.model_score !== null).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {tenders.length} licitación{tenders.length !== 1 ? "es" : ""} · ordenadas por puntuación
          {scoredCount < tenders.length && (
            <span className="ml-2 text-xs">
              ({scoredCount} puntuada{scoredCount !== 1 ? "s" : ""} por el modelo,{" "}
              {tenders.length - scoredCount} pendiente{tenders.length - scoredCount !== 1 ? "s" : ""})
            </span>
          )}
        </p>
        <div className="hidden lg:flex items-center gap-8 text-xs text-muted-foreground pr-4">
          <span className="w-20 text-right">Publicado</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="hidden lg:flex items-center gap-4 px-4 py-2 border-b bg-muted/50 rounded-t-lg text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span className="w-12" title="Puntuación del modelo (0 = Revisar, 5 = Ideal). «Pendiente» cuando el modelo aún no ha puntuado la licitación.">Puntuación</span>
        <span className="flex-1">Licitación</span>
        <span className="w-24 text-right">Presupuesto</span>
        <span className="w-20 text-right">Plazo</span>
        <span className="w-20 text-right">Publicado</span>
      </div>

      {/* Rows */}
      <div className="rounded-lg border overflow-hidden">
        {tenders.map((tender) => (
          <TenderRow key={tender.id} tender={tender} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}
