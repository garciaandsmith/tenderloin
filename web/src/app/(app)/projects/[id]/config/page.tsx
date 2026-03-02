'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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

export default function ConfigPage({ params }: { params: { id: string } }) {
  const [budgetMin, setBudgetMin] = useState('40000')
  const [regions, setRegions] = useState('ES30')
  const [selectedCpv, setSelectedCpv] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('project_filters')
      .select('*')
      .eq('project_id', params.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setBudgetMin(String(data.budget_min_eur))
          setRegions(data.regions.join(', '))
          setSelectedCpv(new Set(data.cpv_codes))
        }
        setLoading(false)
      })
  }, [params.id])

  function toggleCpv(code: string) {
    setSelectedCpv(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    await supabase.from('project_filters').upsert({
      project_id: params.id,
      budget_min_eur: parseFloat(budgetMin) || 40000,
      regions: regions.split(',').map(r => r.trim()).filter(Boolean),
      cpv_codes: [...selectedCpv],
      updated_at: new Date().toISOString(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p className="text-sm text-gray-400">Cargando...</p>

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-5">
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
            <label className="text-sm font-medium text-gray-700">Regiones (NUTS)</label>
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
            {Object.entries(CPV_LABELS).map(([code, label]) => (
              <label key={code} className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedCpv.has(code)}
                  onChange={() => toggleCpv(code)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-500 font-mono text-xs">{code}</span>
                <span className="text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
      >
        {saved ? '¡Guardado!' : 'Guardar cambios'}
      </button>
    </form>
  )
}
