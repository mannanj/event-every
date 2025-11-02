import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Event Every',
  description: 'Snap an image or paste text. Get a calendar event.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
