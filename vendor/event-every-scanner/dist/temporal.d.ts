import { type EvidenceRef, type ScannerIssue, type TemporalClaim, type TemporalPoint } from "./contracts.js";
export declare function resolveZonedPoint(point: Extract<TemporalPoint, {
    kind: "zoned";
}>, evidence: readonly EvidenceRef[]): Readonly<{
    point: Extract<TemporalPoint, {
        kind: "zoned";
    }>;
    issues: readonly ScannerIssue[];
}>;
export declare function compareTemporalPoints(left: TemporalPoint, right: TemporalPoint): -1 | 0 | 1 | null;
export declare function validateTemporalClaim(claim: TemporalClaim): readonly ScannerIssue[];
//# sourceMappingURL=temporal.d.ts.map