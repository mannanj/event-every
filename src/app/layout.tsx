import type { Metadata } from 'next'
import './globals.css'
import AuthWrapper from '@/components/AuthWrapper'
import { Press_Start_2P, Bubblegum_Sans } from 'next/font/google'

const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start',
})

const bubblegumSans = Bubblegum_Sans({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bubblegum',
})

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
      <body className={`${pressStart.variable} ${bubblegumSans.variable}`}>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  )
}
