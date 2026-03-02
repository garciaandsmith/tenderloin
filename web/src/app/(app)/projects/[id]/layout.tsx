import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjectTabs from '@/components/project-tabs'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">{project.name}</h1>
      {project.description && (
        <p className="text-sm text-gray-500 mb-4">{project.description}</p>
      )}
      <ProjectTabs projectId={params.id} />
      {children}
    </div>
  )
}
