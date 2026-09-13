import type { Metadata } from 'next'
import './globals.css'

import { AccountProvider } from '@/components/AccountProvider'

export const metadata: Metadata = {
  title: 'Event Every - anything to your calendar',
  description: 'Event everything. Turn a flyer, screenshot, email, or link into a calendar event - no typing, no account.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  )
}
