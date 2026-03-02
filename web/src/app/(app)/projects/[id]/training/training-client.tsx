'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MIN_LABELS_FOR_MODEL } from '@/lib/scoring/engine'
import type { TenderRaw } from '@/types/database'
import TenderCard from '@/components/tender-card'
import ScoreButtons from '@/components/score-buttons'
import TestMode from '@/components/test-mode'

interface TrainingClientProps {
  projectId: string
  userId: string
  distribution: Record<number, number>
  total: number
  pendingCount: number
  firstTender: TenderRaw | null
}

const SCORE_BAR_COLORS: Record<number, string> = {
  0: 'bg-gray-300', 1: 'bg-red-400', 2: 'bg-orange-400',
  3: 'bg-yellow-400', 4: 'bg-green-400', 5: 'bg-emerald-500',
}

export default function TrainingClient({
  projectId, userId, distribution, total, pendingCount, firstTender,
}: TrainingClientProps) {
  const router = useRouter()
  const [dist, setDist] = useState(distribution)
  const [count, setCount] = useState(total)
  const [pending, setPending] = useState(pendingCount)
  const [tender, setTender] = useState<TenderRaw | null>(firstTender)
  const [selectedScore, setSelectedScore] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const modelActive = count >= MIN_LABELS_FOR_MODEL
  const maxBar = Math.max(...Object.values(dist), 1)

  async function handleLabel() {
    if (selectedScore == null || !tender) return
    setSaving(true)
    const supabase = createClient()

    await supabase.from('tender_labels').upsert({
      project_id: projectId,
      tender_raw_id: tender.id,
      user_id: userId,
      score: selectedScore,
    })

    // Update local state
    setDist(prev => ({ ...prev, [selectedScore]: (prev[selectedScore] ?? 0) + 1 }))
    setCount(c => c + 1)
    setPending(p => Math.max(0, p - 1))
    setSelectedScore(null)

    // Load next tender
    const { data: pt } = await supabase
      .from('project_tenders')
      .select('tender_raw_id')
      .eq('project_id', projectId)
      .eq('passed_filter', true)

    const { data: labeled } = await supabase
      .from('tender_labels')
      .select('tender_raw_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)

    const labeledSet = new Set((labeled ?? []).map(l => l.tender_raw_id))
    const candidates = (pt ?? []).filter(p => !labeledSet.has(p.tender_raw_id))

    if (candidates.length > 0) {
      const { data: next } = await supabase
        .from('tenders_raw')
        .select('*')
        .eq('id', candidates[0].tender_raw_id)
        .single()
      setTender(next)
    } else {
      setTender(null)
    }
    setSaving(false)
  }

  return (
    <>
      {testOpen && (
        <TestMode
          projectId={projectId}
          userId={userId}
          onClose={() => { setTestOpen(false); router.refresh() }}
        />
      )}

      <div className="max-w-2xl space-y-6">
        {/* Label counter */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-semibold text-gray-900 text-lg">{count}</span>
              <span className="text-sm text-gray-500 ml-1.5">etiquetas dadas</span>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              modelActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {modelActive
                ? 'Modelo activo (K-NN)'
                : `Baseline · faltan ${MIN_LABELS_FOR_MODEL - count} para activar el modelo`}
            </span>
          </div>

          {/* Distribution bars */}
          <div className="flex items-end gap-2 h-12">
            {[0, 1, 2, 3, 4, 5].map(score => (
              <div key={score} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400">{dist[score] ?? 0}</span>
                <div
                  className={`w-full rounded-sm transition-all ${SCORE_BAR_COLORS[score]}`}
                  style={{ height: `${Math.max(4, ((dist[score] ?? 0) / maxBar) * 36)}px` }}
                />
                <span className="text-xs font-medium text-gray-600">{score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Labeling queue */}
        {tender ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{pending} licitaciones pendientes de etiquetar</p>
              <button
                onClick={() => setTestOpen(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                Pon a prueba el entrenamiento →
              </button>
            </div>

            <TenderCard tender={tender} />

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">¿Qué puntuación le darías?</p>
              <ScoreButtons value={selectedScore} onChange={setSelectedScore} disabled={saving} />
              <button
                onClick={handleLabel}
                disabled={selectedScore == null || saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar y siguiente →'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
            <p className="font-medium text-gray-900">
              {count === 0
                ? 'No hay licitaciones en la cola de entrenamiento todavía.'
                : '¡Has etiquetado todas las licitaciones disponibles!'}
            </p>
            <p className="text-sm text-gray-500">
              Las nuevas licitaciones aparecerán aquí tras la próxima ingesta diaria de PLACSP.
            </p>
            {count > 0 && (
              <button
                onClick={() => setTestOpen(true)}
                className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                Probar el entrenamiento
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
