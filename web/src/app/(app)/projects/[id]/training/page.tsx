import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TrainingClient from './training-client'

export default async function TrainingPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Label distribution for this user on this project
  const { data: labels } = await supabase
    .from('tender_labels')
    .select('score')
    .eq('project_id', params.id)
    .eq('user_id', user.id)

  const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const l of labels ?? []) distribution[l.score] = (distribution[l.score] ?? 0) + 1
  const total = Object.values(distribution).reduce((s, n) => s + n, 0)

  // Next unlabeled tender
  const { data: allPt } = await supabase
    .from('project_tenders')
    .select('tender_raw_id')
    .eq('project_id', params.id)
    .eq('passed_filter', true)

  const { data: userLabels } = await supabase
    .from('tender_labels')
    .select('tender_raw_id')
    .eq('project_id', params.id)
    .eq('user_id', user.id)

  const labeledIds = new Set((userLabels ?? []).map(l => l.tender_raw_id))
  const candidates = (allPt ?? []).filter(p => !labeledIds.has(p.tender_raw_id))
  const pendingCount = candidates.length

  let firstTender = null
  if (candidates.length > 0) {
    const pick = candidates[0]
    const { data } = await supabase
      .from('tenders_raw')
      .select('*')
      .eq('id', pick.tender_raw_id)
      .single()
    firstTender = data
  }

  return (
    <TrainingClient
      projectId={params.id}
      userId={user.id}
      distribution={distribution}
      total={total}
      pendingCount={pendingCount}
      firstTender={firstTender}
    />
  )
}
