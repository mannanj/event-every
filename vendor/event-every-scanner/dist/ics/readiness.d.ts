import { type EventCandidate, type ScannerIssue } from "../contracts.js";
export type OmittedIcsField = "title" | "description" | "location" | "url" | "end" | "recurrence";
export type IcsPolicy = Readonly<{
    uid: string | null;
    dtstamp: string;
    prodId: string;
}>;
export type IcsReadiness = Readonly<{
    canGenerate: true;
    warnings: readonly ScannerIssue[];
    omittedFields: readonly OmittedIcsField[];
}> | Readonly<{
    canGenerate: false;
    blockers: readonly ScannerIssue[];
    warnings: readonly ScannerIssue[];
    omittedFields: readonly OmittedIcsField[];
}>;
export declare function validateForIcs(candidate: EventCandidate, policy: IcsPolicy): IcsReadiness;
//# sourceMappingURL=readiness.d.ts.map