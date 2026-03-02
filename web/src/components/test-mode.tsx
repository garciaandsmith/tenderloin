'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { baselineScore, knnScore, agreementMessage, MIN_LABELS_FOR_MODEL, SCORE_LABELS, SCORE_COLORS, type LabeledTender } from '@/lib/scoring/engine'
import type { TenderRaw } from '@/types/database'
import TenderCard from './tender-card'
import ScoreButtons from './score-buttons'

type ScoredLabel = LabeledTender

interface TestModeProps {
  projectId: string
  userId: string
  onClose: () => void
}

type Phase = 'thinking' | 'reveal'

export default function TestMode({ projectId, userId, onClose }: TestModeProps) {
  const [tender, setTender] = useState<TenderRaw | null>(null)
  const [modelScore, setModelScore] = useState<number | null>(null)
  const [userScore, setUserScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('thinking')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  const loadNext = useCallback(async () => {
    setFetching(true)
    setLoadError(null)
    setUserScore(null)
    setPhase('thinking')

    const supabase = createClient()

    // Fetch a random tender that this user hasn't labeled yet
    const { data: pt } = await supabase
      .from('project_tenders')
      .select('tender_raw_id')
      .eq('project_id', projectId)
      .eq('passed_filter', true)
      .limit(50)

    if (!pt || pt.length === 0) {
      setLoadError('No hay licitaciones disponibles. Primero hay que importar datos desde PLACSP.')
      setFetching(false)
      return
    }

    // Exclude already labeled by this user
    const { data: labeled } = await supabase
      .from('tender_labels')
      .select('tender_raw_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)

    const labeledIds = new Set((labeled ?? []).map(l => l.tender_raw_id))
    const candidates = pt.filter(p => !labeledIds.has(p.tender_raw_id))

    if (candidates.length === 0) {
      setLoadError('Ya has etiquetado todas las licitaciones disponibles. ¡Buen trabajo!')
      setFetching(false)
      return
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)]

    const { data: raw } = await supabase
      .from('tenders_raw')
      .select('*')
      .eq('id', pick.tender_raw_id)
      .single()

    if (!raw) {
      setLoadError('Error al cargar la licitación.')
      setFetching(false)
      return
    }

    // Compute model score
    const { data: allLabels } = await supabase
      .from('tender_labels')
      .select('tender_raw_id, score')
      .eq('project_id', projectId)

    let predicted: number
    if ((allLabels ?? []).length >= MIN_LABELS_FOR_MODEL) {
      // Fetch titles for K-NN
      const ids = (allLabels ?? []).map(l => l.tender_raw_id)
      const { data: labeledRaws } = await supabase
        .from('tenders_raw')
        .select('id, title, summary')
        .in('id', ids)

      const labelMap = Object.fromEntries((allLabels ?? []).map(l => [l.tender_raw_id, l.score]))
      const scoredLabels: ScoredLabel[] = (labeledRaws ?? []).map(r => ({
        title: r.title,
        summary: r.summary,
        score: labelMap[r.id] ?? 0,
      }))
      predicted = knnScore(raw, scoredLabels)
    } else {
      predicted = baselineScore(raw)
    }

    setTender(raw)
    setModelScore(predicted)
    setFetching(false)
  }, [projectId, userId])

  // Load first tender on mount
  useEffect(() => { loadNext() }, [loadNext])

  async function handleReveal() {
    if (userScore == null) return
    setPhase('reveal')

    // Save user's score as a training label
    const supabase = createClient()
    await supabase.from('tender_labels').upsert({
      project_id: projectId,
      tender_raw_id: tender!.id,
      user_id: userId,
      score: userScore,
    })
  }

  const agreement = phase === 'reveal' && userScore != null && modelScore != null
    ? agreementMessage(userScore, modelScore)
    : null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pon a prueba el entrenamiento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {fetching && (
            <p className="text-sm text-gray-400 text-center py-8">Cargando licitación...</p>
          )}

          {loadError && (
            <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
              {loadError}
            </div>
          )}

          {tender && !fetching && (
            <>
              <div className="text-sm text-gray-500 bg-indigo-50 rounded-lg px-4 py-2.5">
                {phase === 'thinking'
                  ? 'Piensa qué puntuación le darías a esta licitación. Cuando lo tengas claro, selecciona tu puntuación.'
                  : 'Aquí están los resultados. Tu puntuación ya ha sido guardada como etiqueta de entrenamiento.'}
              </div>

              <TenderCard tender={tender} />

              {phase === 'thinking' && (
                <div className="space-y-4">
                  <ScoreButtons value={userScore} onChange={setUserScore} />
                  <button
                    onClick={handleReveal}
                    disabled={userScore == null}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                  >
                    Ver resultado →
                  </button>
                </div>
              )}

              {phase === 'reveal' && agreement && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-500 mb-2">Tu puntuación</p>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${SCORE_COLORS[userScore!]}`}>
                        <span className="text-xl font-bold">{userScore}</span>
                        <span>{SCORE_LABELS[userScore!]}</span>
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-500 mb-2">El sistema</p>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${SCORE_COLORS[modelScore!]}`}>
                        <span className="text-xl font-bold">{modelScore}</span>
                        <span>{SCORE_LABELS[modelScore!]}</span>
                      </span>
                    </div>
                  </div>

                  <p className={`text-center font-semibold text-base ${agreement.color}`}>
                    {agreement.label}
                    {Math.abs(userScore! - modelScore!) >= 2 && (
                      <span className="block text-sm font-normal text-gray-500 mt-1">
                        El modelo necesita más etiquetas de este tipo de licitación.
                      </span>
                    )}
                  </p>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={loadNext}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      Ver otra licitación
                    </button>
                    <button
                      onClick={onClose}
                      className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      Volver al entrenamiento
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
