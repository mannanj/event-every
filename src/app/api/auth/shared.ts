import crypto from 'crypto';

export const AUTH_COOKIE_NAME = 'event-every-auth';
export const AUTH_DURATION_S = 48 * 60 * 60; // 48 hours

let fallbackSecret: string | null = null;

export function getAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!fallbackSecret) {
    fallbackSecret = crypto.randomBytes(32).toString('hex');
  }
  return fallbackSecret;
}

export function generateAuthToken(): string {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + AUTH_DURATION_S * 1000,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, hmac })).toString('base64');
}

export function verifyAuthToken(token: string): boolean {
  try {
    const { data, hmac } = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedHmac = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return false;
    }

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}
