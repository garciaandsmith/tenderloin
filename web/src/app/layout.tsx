import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tenderloin',
  description: 'Monitor inteligente de licitaciones públicas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
