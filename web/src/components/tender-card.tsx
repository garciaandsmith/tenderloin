import type { TenderRaw } from '@/types/database'
import { SCORE_COLORS, SCORE_LABELS } from '@/lib/scoring/engine'

interface TenderCardProps {
  tender: TenderRaw
  score?: number
  scoreMethod?: string
  compact?: boolean
}

function formatEur(amount: number | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TenderCard({ tender, score, scoreMethod, compact = false }: TenderCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <a
            href={tender.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors leading-snug line-clamp-2"
          >
            {tender.title}
          </a>
          <p className="text-sm text-gray-500 mt-0.5">{tender.buyer_name}</p>
        </div>
        {score != null && (
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${SCORE_COLORS[score]}`}>
            <span className="text-base leading-none">{score}</span>
            <span>{SCORE_LABELS[score]}</span>
          </span>
        )}
      </div>

      {!compact && tender.summary && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{tender.summary}</p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span><span className="font-medium text-gray-700">Presupuesto</span> {formatEur(tender.budget_amount)}</span>
        <span><span className="font-medium text-gray-700">Plazo</span> {formatDate(tender.deadline_at)}</span>
        <span><span className="font-medium text-gray-700">CPV</span> {tender.cpv || '—'}</span>
        {tender.region && <span><span className="font-medium text-gray-700">Región</span> {tender.region}</span>}
      </div>

      {scoreMethod && (
        <p className="text-xs text-gray-400">
          Puntuación calculada con {scoreMethod === 'knn' ? 'modelo entrenado (K-NN)' : 'reglas base (baseline)'}
        </p>
      )}
    </div>
  )
}
