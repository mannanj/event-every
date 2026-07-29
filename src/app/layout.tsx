import type { Metadata } from 'next'
import './globals.css'
import AuthWrapper from '@/components/AuthWrapper'

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
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  )
}
