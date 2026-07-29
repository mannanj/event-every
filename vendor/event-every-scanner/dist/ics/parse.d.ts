import { type EventCandidate, type ScannerIssue } from "../contracts.js";
import { type CandidateIdFactory } from "../candidate.js";
export type ParseIcsResult = Readonly<{
    candidates: readonly EventCandidate[];
    issues: readonly ScannerIssue[];
}>;
export declare function parseIcs(input: string, options: Readonly<{
    sourceId: string;
    candidateIdFactory: CandidateIdFactory;
}>): ParseIcsResult;
//# sourceMappingURL=parse.d.ts.map