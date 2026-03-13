import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const getRedis = () =>
  new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

export async function GET() {
  try {
    await getRedis().set('keep-alive', Date.now(), { ex: 172800 }); // 48h TTL
    return NextResponse.json({ ok: true, timestamp: Date.now() });
  } catch (error) {
    console.error('Keep-alive failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
