import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Event Every — anything to your calendar',
  description: 'Event everything. Turn a flyer, screenshot, email, or link into a calendar event — no typing, no account.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
