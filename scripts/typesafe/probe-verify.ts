import { EventCandidateSchema, type EventCandidate } from '@event-every/scanner';
import { verifyCandidates } from '../../src/server/typesafe/verify';

const ev = (excerpt: string) => [{ sourceId: 's1', locator: null, excerpt, startOffset: null, endOffset: null }];
const claim = <V>(value: V, excerpt?: string) => ({ value, confidence: 0.8, evidence: excerpt ? ev(excerpt) : [] });

const candidate: EventCandidate = EventCandidateSchema.parse({
  candidateId: '44444444-4444-4444-8444-444444444444',
  sourceUid: null,
  title: claim('Autumn Social Friday 3 October'),
  description: claim(null),
  location: claim('The Old Hall'),
  url: claim(null),
  temporal: claim({ start: { kind: 'floating', date: { year: 2026, month: 10, day: 3 }, time: { hour: 19, minute: 30, second: 0 } }, end: null, duration: null, allDay: false }),
  recurrence: claim(null),
  issues: [],
});

// Exactly the image path: no request text, only what the model quoted.
const evidence = new Map([[candidate.candidateId, 'AUTUMN SOCIAL\nThe Old Hall\nFri 3 Oct, doors 7pm, show 7.30pm']]);
const started = Date.now();
const out = await verifyCandidates([candidate], { requestText: null, evidence, nowMs: Date.parse('2026-09-19T10:00:00Z') });
console.log('ms', Date.now() - started);
console.log(JSON.stringify(out, null, 2));
