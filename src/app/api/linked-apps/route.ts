import { NextResponse } from 'next/server';
import { failJson, personAndApp } from '@/server/linked-apps/http';
import { linkedApps } from '@/server/linked-apps/service';

export const dynamic = 'force-dynamic';

/** Which sister apps this account is signed in to: `{ links: [{ appId, connectedAt }] }`. */
export async function GET(request: Request) {
  const who = await personAndApp(request, null);
  if ('error' in who) return who.error;
  try {
    return NextResponse.json(
      { configured: who.ctx.secret !== null, links: await linkedApps.status(who.ctx) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return failJson(500, 'Could not load sign-ins.');
  }
}

/** Sign out of `?app=calendar`: forget the tokens here, then revoke them there. No body. */
export async function DELETE(request: Request) {
  const who = await personAndApp(request, new URL(request.url).searchParams.get('app') ?? '');
  if ('error' in who) return who.error;
  try {
    await linkedApps.signOut(who.ctx, who.appId!);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return failJson(500, 'Could not sign out.');
  }
}
