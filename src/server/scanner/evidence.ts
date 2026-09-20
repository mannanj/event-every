import type { EventCandidate } from '@event-every/scanner';

/**
 * The excerpts the model quoted for one candidate, deduped in claim order.
 *
 * These live for the life of the request and no longer. The durable replay
 * projection in `platform/provider/replay.ts` drops all evidence on purpose, so
 * no source content is ever written to the provider operation record; anything
 * that wants the model's own words has to read them here, on the way out.
 */
export function evidenceText(candidate: EventCandidate, maxChars: number): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const claim of [candidate.title, candidate.description, candidate.location, candidate.url, candidate.temporal, candidate.recurrence]) {
    for (const ref of claim.evidence) {
      const excerpt = ref.excerpt?.trim();
      if (!excerpt) continue;
      const key = excerpt.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(excerpt);
    }
  }
  return parts.join('\n').slice(0, maxChars);
}

export const evidenceByCandidate = (candidates: readonly EventCandidate[], maxChars: number): Map<string, string> =>
  new Map(candidates.map((candidate) => [candidate.candidateId, evidenceText(candidate, maxChars)]));
