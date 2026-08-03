export type ClosedEventCode = 'deferred_work_failed' | 'legacy_charge_unavailable' | 'legacy_provider_unavailable' | 'legacy_waitlist_unavailable';
export type ClosedRoute = 'scan' | 'resolve-timezone' | 'summarize' | 'usage' | 'waitlist';
export type ClosedPhase = 'admission' | 'dispatch' | 'deferred';
export type ClosedOutcome = 'accepted' | 'rejected' | 'unavailable';
export type ClosedEvent = Readonly<{ code: ClosedEventCode; id?: string; route?: ClosedRoute; phase?: ClosedPhase; statusClass?: 4 | 5; retryable?: boolean; durationBucket?: 'under_100ms' | 'under_1s' | 'over_1s'; outcome?: ClosedOutcome }>;
export function recordClosedEvent(_event: ClosedEventCode | ClosedEvent): void { void _event; }
