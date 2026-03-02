/**
 * Scoring engine — two modes:
 *
 * 1. Baseline (always available): weighted keyword overlap against agency profile
 *    + CPV prefix lookup. Returns 0-5.
 *
 * 2. K-NN (activates when the project has ≥ MIN_LABELS labels): finds the K most
 *    similar labeled tenders by Jaccard word-set similarity and returns the
 *    weighted average of their scores.
 */

export const MIN_LABELS_FOR_MODEL = 20

// ── CPV prefix → baseline score ──────────────────────────────────────────────
const CPV_SCORES: Array<[string, number]> = [
  ['79416', 5], // Relaciones públicas
  ['79340', 4], // Publicidad y marketing
  ['79952', 4], // Servicios de eventos
  ['79822', 4], // Diseño gráfico
  ['92111', 4], // Producción vídeos publicitarios
  ['79930', 4], // Diseño especializado
  ['79950', 4], // Exposiciones y congresos
  ['79953', 4], // Organización de festivales
  ['79954', 4], // Organización de fiestas
  ['79411', 3], // Consultoría en gestión
  ['79311', 3], // Evaluación/sondeos
  ['79800', 3], // Impresión (con creatividad)
  ['72400', 2], // Servicios de Internet
  ['72500', 2], // Servicios informáticos
  ['72322', 2], // Gestión de datos
  ['72212', 2], // Desarrollo software web
]

// ── Weighted keyword list (agency profile) ────────────────────────────────────
const KEYWORDS: Array<[string, number]> = [
  ['relaciones públicas', 1.5],
  ['comunicación institucional', 1.5],
  ['reputación', 1.3],
  ['branding', 1.3],
  ['redes sociales', 1.2],
  ['social media', 1.2],
  ['comunicación', 1.0],
  ['marketing digital', 1.2],
  ['marketing', 1.0],
  ['publicidad', 1.0],
  ['campaña', 1.0],
  ['eventos', 1.0],
  ['diseño gráfico', 1.1],
  ['identidad visual', 1.1],
  ['audiovisual', 1.0],
  ['producción', 0.8],
  ['contenido digital', 1.0],
  ['contenido', 0.8],
  ['seo', 1.0],
  ['paid media', 1.0],
  ['medios', 0.7],
  ['prensa', 0.8],
  ['influencer', 1.0],
  ['creatividad', 0.8],
  ['creatividad', 0.8],
  ['estrategia de comunicación', 1.3],
  ['estrategia', 0.6],
  ['imagen corporativa', 1.1],
  ['imagen', 0.6],
  ['web', 0.6],
]

const STOPWORDS = new Set([
  'para', 'este', 'esta', 'estos', 'estas', 'como', 'con', 'por', 'que',
  'los', 'las', 'una', 'del', 'sobre', 'entre', 'sus', 'ser', 'son',
  'más', 'sin', 'tras', 'pero', 'cada', 'también', 'según', 'mediante',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[\s,;.:()[\]/"']+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w))
  )
}

// ── Baseline scoring ──────────────────────────────────────────────────────────
export function baselineScore(tender: { title: string; summary: string; cpv: string }): number {
  const text = `${tender.title} ${tender.summary}`.toLowerCase()

  // CPV match (strong structural signal)
  for (const [prefix, score] of CPV_SCORES) {
    if (tender.cpv.startsWith(prefix)) {
      // Still blend with keyword overlap for nuance
      const kw = keywordOverlap(text)
      return Math.round(score * 0.7 + kw * 0.3)
    }
  }

  // Keyword-only fallback
  return Math.round(keywordOverlap(text))
}

function keywordOverlap(text: string): number {
  let score = 0
  let totalWeight = 0
  for (const [kw, weight] of KEYWORDS) {
    if (text.includes(kw)) score += weight
    totalWeight += weight
  }
  // Scale raw overlap to 0-5
  return Math.min(5, (score / totalWeight) * 12)
}

// ── K-NN scoring ──────────────────────────────────────────────────────────────
export interface LabeledTender {
  title: string
  summary: string
  score: number
}

export function knnScore(
  tender: { title: string; summary: string; cpv: string },
  labels: LabeledTender[],
  k = 7,
): number {
  if (labels.length < MIN_LABELS_FOR_MODEL) return baselineScore(tender)

  const targetWords = tokenize(`${tender.title} ${tender.summary}`)

  const ranked = labels
    .map(l => {
      const lWords = tokenize(`${l.title} ${l.summary}`)
      const intersection = [...targetWords].filter(w => lWords.has(w)).length
      const union = new Set([...targetWords, ...lWords]).size
      const sim = union > 0 ? intersection / union : 0
      return { score: l.score, sim }
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)

  const totalSim = ranked.reduce((s, x) => s + x.sim, 0)
  if (totalSim === 0) return baselineScore(tender)

  const weighted = ranked.reduce((s, x) => s + x.score * x.sim, 0) / totalSim
  return Math.round(weighted)
}

// ── Score display helpers ─────────────────────────────────────────────────────
export const SCORE_LABELS: Record<number, string> = {
  0: 'Revisión manual',
  1: 'No alineada',
  2: 'Probablemente no',
  3: 'Dudosa',
  4: 'Probablemente sí',
  5: 'Totalmente alineada',
}

export const SCORE_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-700',
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-emerald-100 text-emerald-700',
}

export const SCORE_BUTTON_COLORS: Record<number, string> = {
  0: 'border-gray-300 hover:bg-gray-50 data-[active=true]:bg-gray-200 data-[active=true]:border-gray-500',
  1: 'border-red-300 hover:bg-red-50 data-[active=true]:bg-red-200 data-[active=true]:border-red-500',
  2: 'border-orange-300 hover:bg-orange-50 data-[active=true]:bg-orange-200 data-[active=true]:border-orange-500',
  3: 'border-yellow-300 hover:bg-yellow-50 data-[active=true]:bg-yellow-200 data-[active=true]:border-yellow-500',
  4: 'border-green-300 hover:bg-green-50 data-[active=true]:bg-green-200 data-[active=true]:border-green-500',
  5: 'border-emerald-300 hover:bg-emerald-50 data-[active=true]:bg-emerald-200 data-[active=true]:border-emerald-500',
}

export function agreementMessage(userScore: number, modelScore: number): { label: string; color: string } {
  const diff = Math.abs(userScore - modelScore)
  if (diff === 0) return { label: '¡De acuerdo!', color: 'text-green-600' }
  if (diff === 1) return { label: 'Cerca', color: 'text-yellow-600' }
  return { label: 'Diferimos', color: 'text-red-600' }
}
