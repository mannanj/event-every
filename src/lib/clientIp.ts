import type { NextRequest } from 'next/server';

// Single source of truth for client-IP extraction across API routes. Trusts the
// first hop of x-forwarded-for, then x-real-ip; both are spoofable without an
// authenticated proxy in front, so this is best-effort (see findings table).
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}
