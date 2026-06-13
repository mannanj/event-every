import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { d1Query, isD1Configured } from '@/lib/d1';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SIGNUPS_PER_IP_PER_DAY = 5;

const isRedisAvailable = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const getRedis = () =>
  new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function overSignupLimit(ip: string): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    const redis = getRedis();
    const key = `waitlist:rl:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 24 * 60 * 60);
    return count > MAX_SIGNUPS_PER_IP_PER_DAY;
  } catch {
    return false;
  }
}

interface SaveResult {
  saved: boolean;
  alreadyJoined: boolean;
  store: 'd1' | 'redis' | null;
}

async function saveSignup(email: string, userAgent: string | null): Promise<SaveResult> {
  if (isD1Configured()) {
    try {
      const result = await d1Query(
        'INSERT INTO waitlist (email, source, user_agent) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
        [email, 'event-every', userAgent]
      );
      return { saved: true, alreadyJoined: (result.meta?.changes ?? 0) === 0, store: 'd1' };
    } catch (error) {
      console.error('Waitlist D1 insert failed, falling back to Redis:', error);
    }
  }

  if (isRedisAvailable()) {
    try {
      // Idempotent fallback store so no signup is ever dropped; entries here
      // can be drained into D1 later (keys: waitlist:pending:<email>).
      const created = await getRedis().setnx(
        `waitlist:pending:${email}`,
        JSON.stringify({ email, source: 'event-every', userAgent, createdAt: new Date().toISOString() })
      );
      return { saved: true, alreadyJoined: created === 0, store: 'redis' };
    } catch (error) {
      console.error('Waitlist Redis fallback failed:', error);
    }
  }

  return { saved: false, alreadyJoined: false, store: null };
}

async function sendConfirmationEmail(email: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM || 'Spirit & Hammer <onboarding@resend.dev>';
  const text = [
    "You're on the list.",
    '',
    "You joined the waitlist for the Spirit & Hammer collective. When membership opens, you'll receive an invitation at this address.",
    '',
    'Membership provides access to several member apps, including Event Every.',
    '',
    '— Spirit & Hammer',
    '',
    "You're receiving this one-time confirmation because this address was submitted to the Event Every waitlist (summonit.app). If this wasn't you, you can ignore this email.",
  ].join('\n');
  const html = `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000000; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; border-bottom: 2px solid #000000; padding-bottom: 12px;">You&rsquo;re on the list.</h1>
  <p style="font-size: 15px; line-height: 1.6;">You joined the waitlist for the <strong>Spirit &amp; Hammer</strong> collective. When membership opens, you&rsquo;ll receive an invitation at this address.</p>
  <p style="font-size: 15px; line-height: 1.6;">Membership provides access to several member apps, including <strong>Event Every</strong>.</p>
  <p style="font-size: 15px;">&mdash; Spirit &amp; Hammer</p>
  <p style="font-size: 12px; color: #666666; margin-top: 32px;">You&rsquo;re receiving this one-time confirmation because this address was submitted to the Event Every waitlist (summonit.app). If this wasn&rsquo;t you, you can ignore this email.</p>
</div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Same signup retried within 24h returns the original send, no dupe.
        'Idempotency-Key': `waitlist-confirmation/${email}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "You're on the waitlist — Spirit & Hammer",
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error('Resend send failed:', response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (error) {
    console.error('Resend send error:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const honeypot = typeof body.website === 'string' ? body.website : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    // Bots fill the hidden field — pretend success and drop silently.
    if (honeypot) {
      return NextResponse.json({ ok: true, alreadyJoined: false, emailSent: false });
    }

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (await overSignupLimit(getClientIP(request))) {
      return NextResponse.json(
        { error: 'Too many signups from this connection today. Please try again tomorrow.' },
        { status: 429 }
      );
    }

    const result = await saveSignup(email, request.headers.get('user-agent'));
    if (!result.saved) {
      return NextResponse.json(
        { error: "We couldn't save your signup right now. Please try again later." },
        { status: 503 }
      );
    }

    let emailSent = false;
    if (!result.alreadyJoined) {
      emailSent = await sendConfirmationEmail(email);
      if (emailSent && result.store === 'd1') {
        d1Query('UPDATE waitlist SET email_sent = 1 WHERE email = ?', [email]).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, alreadyJoined: result.alreadyJoined, emailSent });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
