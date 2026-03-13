import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const getRedis = () =>
  new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
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
