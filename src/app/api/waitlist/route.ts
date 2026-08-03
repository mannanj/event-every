import { NextRequest, NextResponse } from 'next/server';
import { bindLegacyWaitlistRequest } from '@/platform/legacy';
import { getWaitlistPort } from '@/platform/runtime';

export async function POST(request: NextRequest) {
  const selectedPort = getWaitlistPort();
  if ('status' in selectedPort) return NextResponse.json({ error: 'State is not ready.', code: 'c1_state_not_ready' }, { status: 503 });
  const port = bindLegacyWaitlistRequest(selectedPort, request);
  try {
    const body = await request.json().catch(() => ({}));
    const honeypot = typeof body.website === 'string' ? body.website : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    // Bots fill the hidden field — pretend success and drop silently.
    if (honeypot) {
      return NextResponse.json({ ok: true, alreadyJoined: false, emailSent: false });
    }

    const result = await port.submit({ identity: { kind: 'unknown', keyVersion: '', hmac: '' }, email, honeypot, userAgent: request.headers.get('user-agent') });
    if (result.status === 'invalid') return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    if (result.status === 'rate-limited') return NextResponse.json({ error: 'Too many signups from this connection today. Please try again tomorrow.' }, { status: 429 });
    if (result.status === 'unavailable') return NextResponse.json({ error: "We couldn't save your signup right now. Please try again later." }, { status: 503 });
    return NextResponse.json({ ok: true, alreadyJoined: result.alreadyJoined, emailSent: result.emailSent });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
