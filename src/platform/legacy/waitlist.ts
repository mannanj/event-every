import type { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { getClientIP } from '@/lib/clientIp';
import { d1Query, isD1Configured } from '@/lib/d1';
import { deferPlatformWork } from '@/platform/cloudflare-context';
import type { LegacyWaitlistPort } from '@/platform/contracts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SIGNUPS_PER_IP_PER_DAY = 5;

const redisAvailable = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const getRedis = () => new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

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
      await response.body?.cancel();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function createRequestBoundLegacyWaitlistPort(request: NextRequest): LegacyWaitlistPort {
  // Task 4 replaces getClientIP's forwarding-header compatibility with the
  // trusted admission identity. Until then, preserve the exact legacy shard.
  const legacyRateLimitShard = getClientIP(request);

  return {
    async submit(input) {
      if (input.honeypot) return { status: 'accepted', alreadyJoined: false, emailSent: false };
      if (!input.email || input.email.length > 254 || !EMAIL_RE.test(input.email)) {
        return { status: 'invalid', code: 'invalid_email' };
      }

      let redis: Redis | undefined;
      try {
        if (redisAvailable()) {
          redis = getRedis();
          try {
            const key = `waitlist:rl:${legacyRateLimitShard}:${new Date().toISOString().slice(0, 10)}`;
            const count = await redis.incr(key);
            if (count === 1) await redis.expire(key, 24 * 60 * 60);
            if (count > MAX_SIGNUPS_PER_IP_PER_DAY) {
              return { status: 'rate-limited', code: 'waitlist_rate_limited' };
            }
          } catch {
            // The legacy per-IP gate is intentionally fail-open on Redis failure.
          }
        }

        let alreadyJoined = false;
        let store: 'd1' | 'redis' | null = null;
        if (isD1Configured()) {
          try {
            const result = await d1Query(
              'INSERT INTO waitlist (email, source, user_agent) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
              [input.email, 'event-every', input.userAgent],
            );
            alreadyJoined = (result.meta?.changes ?? 0) === 0;
            store = 'd1';
          } catch {
            // Preserve the legacy D1-to-Redis fallback.
          }
        }

        if (!store && redis) {
          try {
            const created = await redis.setnx(
              `waitlist:pending:${input.email}`,
              JSON.stringify({
                email: input.email,
                source: 'event-every',
                userAgent: input.userAgent,
                createdAt: new Date().toISOString(),
              }),
            );
            alreadyJoined = created === 0;
            store = 'redis';
          } catch {
            // Fixed unavailable result below.
          }
        }

        if (!store) return { status: 'unavailable', code: 'legacy_waitlist_unavailable' };

        const emailSent = !alreadyJoined && await sendConfirmationEmail(input.email);
        if (emailSent && store === 'd1') {
          deferPlatformWork(
            d1Query('UPDATE waitlist SET email_sent = 1 WHERE email = ?', [input.email]).then(() => undefined),
          );
        }
        return { status: 'accepted', alreadyJoined, emailSent };
      } catch {
        return { status: 'unavailable', code: 'legacy_waitlist_unavailable' };
      }
    },
  };
}

// Like usage, this is a request-free runtime marker. The route binds the
// compatibility request only after the mode gate has selected legacy.
export const legacyWaitlistPort: LegacyWaitlistPort = {
  async submit() {
    return { status: 'unavailable', code: 'legacy_waitlist_unavailable' };
  },
};

export function bindLegacyWaitlistRequest(port: LegacyWaitlistPort, request: NextRequest): LegacyWaitlistPort {
  return port === legacyWaitlistPort ? createRequestBoundLegacyWaitlistPort(request) : port;
}
