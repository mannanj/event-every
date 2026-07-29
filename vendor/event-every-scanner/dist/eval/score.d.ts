import type { EvalCase } from "./contracts.js";
export type DigestPort = (value: unknown) => string;
export type EvalViolationCode = "schema_invalid_actual" | "candidate_count_mismatch" | "candidate_reordered" | "field_missing" | "field_fabricated" | "field_mismatch" | "issue_missing" | "issue_extra" | "issue_reordered" | "evidence_missing" | "evidence_extra" | "evidence_reordered" | "evidence_unknown_source";
export type EvalViolation = Readonly<{
    code: EvalViolationCode;
    candidateIndex: number | null;
    issueIndex: number | null;
    evidenceIndex: number | null;
    fieldPath: string | null;
    state: "missing" | "extra" | "mismatch" | "invalid" | "reordered";
}>;
export type EvalCaseScorecard = Readonly<{
    caseId: string;
    valid: boolean;
    exact: boolean;
    candidateCount: Readonly<{
        expected: number;
        actual: number;
        matched: number;
        missing: number;
        extra: number;
    }>;
    fields: Readonly<{
        exactValues: number;
        exactNulls: number;
        missingValues: number;
        fabricatedValues: number;
        mismatchedValues: number;
    }>;
    issues: Readonly<{
        exact: number;
        missing: number;
        extra: number;
        reordered: number;
    }>;
    evidence: Readonly<{
        exact: number;
        missing: number;
        extra: number;
        invalidSource: number;
    }>;
    violations: readonly EvalViolation[];
}>;
export declare function scoreCase(caseData: EvalCase, actualInput: unknown, digest?: DigestPort): EvalCaseScorecard;
//# sourceMappingURL=score.d.ts.map