import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const projects = profile?.organization_id
    ? (await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at')).data ?? []
    : []

  return (
    <div className="flex min-h-screen">
      <Sidebar projects={projects} />
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  )
}
