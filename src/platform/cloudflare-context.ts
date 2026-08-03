import { getCloudflareContext } from '@opennextjs/cloudflare';
import { recordClosedEvent } from '@/platform/logger';
export function deferPlatformWork(work: Promise<void>): void {
  const observed = work.catch(() => { recordClosedEvent('deferred_work_failed'); });
  try { getCloudflareContext().ctx.waitUntil(observed); } catch { void observed; }
}
