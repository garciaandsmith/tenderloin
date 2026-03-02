'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Default CPV codes from agency profile
const DEFAULT_CPV_CODES = [
  '79416000', '79416200', '79340000', '79411000', '79311400', '79311200',
  '72400000', '72500000', '72322000', '72212224', '79822500', '92111200',
  '92100000', '79930000', '79800000', '79952000', '79950000', '79953000', '79954000',
]

const CPV_LABELS: Record<string, string> = {
  '79416000': 'Relaciones públicas',
  '79416200': 'Consultoría en RR.PP.',
  '79340000': 'Publicidad y marketing',
  '79411000': 'Consultoría en gestión',
  '79311400': 'Evaluación de campañas',
  '79311200': 'Sondeos de opinión',
  '72400000': 'Servicios de Internet',
  '72500000': 'Servicios informáticos',
  '72322000': 'Gestión de datos',
  '72212224': 'Desarrollo software web',
  '79822500': 'Diseño gráfico',
  '92111200': 'Producción vídeos publicitarios',
  '92100000': 'Servicios de cine y vídeo',
  '79930000': 'Diseño especializado',
  '79800000': 'Servicios de impresión',
  '79952000': 'Servicios de eventos',
  '79950000': 'Exposiciones y congresos',
  '79953000': 'Organización de festivales',
  '79954000': 'Organización de fiestas',
}

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [budgetMin, setBudgetMin] = useState('40000')
  const [regions, setRegions] = useState('ES30')
  const [selectedCpv, setSelectedCpv] = useState<Set<string>>(new Set(DEFAULT_CPV_CODES))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleCpv(code: string) {
    setSelectedCpv(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .single()

    if (!profile?.organization_id) {
      setError('No se encontró organización.')
      setLoading(false)
      return
    }

    const { data: project, error: projError } = await supabase
      .from('projects')
      .insert({ name, description: description || null, organization_id: profile.organization_id })
      .select()
      .single()

    if (projError || !project) {
      setError('Error al crear el proyecto.')
      setLoading(false)
      return
    }

    await supabase.from('project_filters').insert({
      project_id: project.id,
      budget_min_eur: parseFloat(budgetMin) || 40000,
      regions: regions.split(',').map(r => r.trim()).filter(Boolean),
      cpv_codes: [...selectedCpv],
    })

    router.push(`/projects/${project.id}/inbox`)
    router.refresh()
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nuevo proyecto</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-800 text-sm">Datos generales</h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Nombre del proyecto</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Descripción (opcional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-800 text-sm">Filtrado duro</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Presupuesto mínimo (€)</label>
              <input
                type="number"
                min="0"
                value={budgetMin}
                onChange={e => setBudgetMin(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Regiones (código NUTS)</label>
              <input
                type="text"
                value={regions}
                onChange={e => setRegions(e.target.value)}
                placeholder="ES30, ES51"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Códigos CPV ({selectedCpv.size} seleccionados)
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {DEFAULT_CPV_CODES.map(code => (
                <label key={code} className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCpv.has(code)}
                    onChange={() => toggleCpv(code)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-500 font-mono text-xs">{code}</span>
                  <span className="text-gray-700">{CPV_LABELS[code]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Creando...' : 'Crear proyecto'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
