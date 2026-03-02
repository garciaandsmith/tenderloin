import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectsPage() {
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

  if (projects.length === 1) redirect(`/projects/${projects[0].id}/inbox`)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Proyectos</h1>
        <Link
          href="/projects/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Nuevo proyecto
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 mb-4">No hay proyectos todavía.</p>
          <Link
            href="/projects/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Crear primer proyecto
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/inbox`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
            >
              <p className="font-medium text-gray-900">{p.name}</p>
              {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
