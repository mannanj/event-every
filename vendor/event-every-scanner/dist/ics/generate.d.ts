import type { EventCandidate, ScannerIssue } from "../contracts.js";
import { type IcsPolicy, type OmittedIcsField } from "./readiness.js";
export type IcsGenerationResult = Readonly<{
    ok: true;
    calendarText: string;
    warnings: readonly ScannerIssue[];
    omittedFields: readonly OmittedIcsField[];
}> | Readonly<{
    ok: false;
    blockers: readonly ScannerIssue[];
    warnings: readonly ScannerIssue[];
    omittedFields: readonly OmittedIcsField[];
}>;
export declare function generateIcs(candidate: EventCandidate, policy: IcsPolicy): IcsGenerationResult;
//# sourceMappingURL=generate.d.ts.map