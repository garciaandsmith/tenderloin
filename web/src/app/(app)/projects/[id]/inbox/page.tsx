import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TenderCard from '@/components/tender-card'

export default async function InboxPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch inbox items with tender data
  const { data: items } = await supabase
    .from('project_inbox')
    .select(`
      id, smart_score, score_method, is_read, added_at,
      tenders_raw (*)
    `)
    .eq('project_id', params.id)
    .order('smart_score', { ascending: false })
    .order('added_at', { ascending: false })

  const unreadCount = (items ?? []).filter(i => !i.is_read).length

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-900">{(items ?? []).length}</span>
          <span className="text-sm text-gray-500 ml-1.5">licitaciones en el buzón</span>
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {unreadCount} nuevas
            </span>
          )}
        </div>
      </div>

      {(items ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center space-y-2">
          <p className="font-medium text-gray-900">El buzón está vacío</p>
          <p className="text-sm text-gray-500">
            Las licitaciones que superen el filtrado duro e inteligente aparecerán aquí
            tras la próxima ingesta diaria de PLACSP.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(items ?? []).map(item => {
            const tender = item.tenders_raw as any
            if (!tender) return null
            return (
              <div key={item.id} className={`relative ${!item.is_read ? 'ring-2 ring-indigo-200 ring-offset-2 rounded-xl' : ''}`}>
                {!item.is_read && (
                  <span className="absolute -top-2 -right-2 z-10 w-3 h-3 bg-indigo-500 rounded-full border-2 border-white" />
                )}
                <TenderCard
                  tender={tender}
                  score={Math.round(item.smart_score)}
                  scoreMethod={item.score_method}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
