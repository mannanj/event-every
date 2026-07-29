import { type RecurrenceClaim, type ScannerIssue, type TemporalPoint } from "./contracts.js";
export declare function parseRecurrence(input: Readonly<{
    rrule: string;
    rDates: readonly TemporalPoint[];
    exDates: readonly TemporalPoint[];
    start: TemporalPoint;
}>): Readonly<{
    recurrence: RecurrenceClaim | null;
    issues: readonly ScannerIssue[];
}>;
export declare function canonicalizeRecurrence(recurrence: RecurrenceClaim): Readonly<{
    rrule: string;
    rDates: readonly TemporalPoint[];
    exDates: readonly TemporalPoint[];
}>;
//# sourceMappingURL=recurrence.d.ts.map