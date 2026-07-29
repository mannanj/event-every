import { type EventCandidate, type ProviderScanObservation, type ScannerIssue, type SourceHandle } from "./contracts.js";
import { type CandidateIdFactory } from "./candidate.js";
export interface TextLinkProviderPort {
    scan(sources: readonly Extract<SourceHandle, {
        kind: "text" | "link";
    }>[]): Promise<ProviderScanObservation>;
}
export interface VisionProviderPort {
    scan(sources: readonly Extract<SourceHandle, {
        kind: "image";
    }>[]): Promise<ProviderScanObservation>;
}
/**
 * Validates the identity relation shared by every provider port before a resolver or adapter can
 * attribute evidence.  The error deliberately names no source or handle.
 */
export declare function assertUniqueProviderSourceIds(sources: readonly Readonly<{
    sourceId: string;
}>[]): void;
export declare function candidatesFromProviderObservation(observation: ProviderScanObservation, candidateIdFactory: CandidateIdFactory): Readonly<{
    candidates: readonly EventCandidate[];
    issues: readonly ScannerIssue[];
}>;
//# sourceMappingURL=provider-ports.d.ts.map