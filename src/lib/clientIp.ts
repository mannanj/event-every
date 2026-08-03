import type { NextRequest } from 'next/server';
import { INTERNAL_IDENTITY_HEADER } from '@/platform/identity';

const INJECTED_IDENTITY = /^known:[A-Za-z0-9._-]{1,64}:[0-9a-f]{64}$/;

export function getClientIP(request: NextRequest): string {
  const identity = request.headers.get(INTERNAL_IDENTITY_HEADER);
  return identity !== null && INJECTED_IDENTITY.test(identity) ? identity : 'unknown';
}
