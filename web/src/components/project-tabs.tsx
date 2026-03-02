'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Buzón', href: 'inbox' },
  { label: 'Entrenamiento', href: 'training' },
  { label: 'Configuración', href: 'config' },
]

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0.5 border-b border-gray-200 mb-6">
      {TABS.map(tab => {
        const href = `/projects/${projectId}/${tab.href}`
        const active = pathname.startsWith(href)
        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
