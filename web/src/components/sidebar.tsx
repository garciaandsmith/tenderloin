'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/types/database'

interface SidebarProps {
  projects: Project[]
}

export default function Sidebar({ projects }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-gray-300 flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="text-white font-bold text-base tracking-tight">Tenderloin</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Proyectos
        </p>

        {projects.map(p => (
          <Link
            key={p.id}
            href={`/projects/${p.id}/inbox`}
            className={`block truncate px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname.startsWith(`/projects/${p.id}`)
                ? 'bg-indigo-600 text-white'
                : 'hover:bg-gray-800 text-gray-300'
            }`}
          >
            {p.name}
          </Link>
        ))}

        <Link
          href="/projects/new"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors mt-1"
        >
          <span>+</span> Nuevo proyecto
        </Link>
      </nav>

      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
