import { type CandidateObservation, type ScannerIssue } from "./contracts.js";
export declare function issue(input: ScannerIssue): ScannerIssue;
export declare function sortIssues(issues: readonly ScannerIssue[]): readonly ScannerIssue[];
export declare function deduplicateIssues(issues: readonly ScannerIssue[]): readonly ScannerIssue[];
export declare function issuesForMissingClaims(observation: CandidateObservation): readonly ScannerIssue[];
//# sourceMappingURL=issues.d.ts.map