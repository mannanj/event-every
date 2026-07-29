import { z } from "zod";
import type { EvalCaseScorecard } from "./score.js";
export declare const SafeEvalFailureSchema: z.ZodReadonly<z.ZodObject<{
    code: z.ZodEnum<{
        local_validation: "local_validation";
        source_resolution: "source_resolution";
        transport_network: "transport_network";
        transport_timeout: "transport_timeout";
        transport_http: "transport_http";
        privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
        provider_refusal: "provider_refusal";
        provider_empty: "provider_empty";
        provider_malformed: "provider_malformed";
        observation_invalid: "observation_invalid";
        billing_evidence_missing: "billing_evidence_missing";
        billing_evidence_invalid: "billing_evidence_invalid";
    }>;
    retryable: z.ZodBoolean;
    httpStatus: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>>;
export declare const EvalCaseFailureSchema: z.ZodReadonly<z.ZodObject<{
    caseId: z.ZodString;
    callId: z.ZodNullable<z.ZodString>;
    failure: z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            local_validation: "local_validation";
            source_resolution: "source_resolution";
            transport_network: "transport_network";
            transport_timeout: "transport_timeout";
            transport_http: "transport_http";
            privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
            provider_refusal: "provider_refusal";
            provider_empty: "provider_empty";
            provider_malformed: "provider_malformed";
            observation_invalid: "observation_invalid";
            billing_evidence_missing: "billing_evidence_missing";
            billing_evidence_invalid: "billing_evidence_invalid";
        }>;
        retryable: z.ZodBoolean;
        httpStatus: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>>;
export declare const ActualChargeEvidenceSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    evidenceId: z.ZodString;
    callId: z.ZodString;
    reservationId: z.ZodString;
    providerRequestIdDigest: z.ZodString;
    chargedMicros: z.ZodNumber;
    admittedAt: z.ZodString;
}, z.core.$strict>>;
export declare const NoChargeEvidenceSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    proofId: z.ZodString;
    callId: z.ZodString;
    reservationId: z.ZodString;
    reason: z.ZodEnum<{
        local_validation_before_transport: "local_validation_before_transport";
        week_rollover_before_transport: "week_rollover_before_transport";
        transport_refused_before_admission: "transport_refused_before_admission";
    }>;
}, z.core.$strict>>;
export declare const LiveSpendReportSchema: z.ZodReadonly<z.ZodObject<{
    weekKey: z.ZodString;
    reservationId: z.ZodString;
    reservationState: z.ZodEnum<{
        open: "open";
        closed: "closed";
        unresolved: "unresolved";
    }>;
    settledActualMicros: z.ZodNumber;
    heldMicros: z.ZodNumber;
    actualEvidenceIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    noChargeProofIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
}, z.core.$strict>>;
export declare const EvalAggregateScorecardSchema: z.ZodReadonly<z.ZodObject<{
    caseCount: z.ZodNumber;
    completedCaseCount: z.ZodNumber;
    failedCaseCount: z.ZodNumber;
    exactCaseCount: z.ZodNumber;
    expectedCandidateCount: z.ZodNumber;
    actualCandidateCount: z.ZodNumber;
    missingCandidateCount: z.ZodNumber;
    unexpectedCandidateCount: z.ZodNumber;
    reorderedCandidateCount: z.ZodNumber;
    invalidActualCount: z.ZodNumber;
    violationCount: z.ZodNumber;
    fields: z.ZodObject<{
        exactValues: z.ZodNumber;
        exactNulls: z.ZodNumber;
        missingValues: z.ZodNumber;
        fabricatedValues: z.ZodNumber;
        mismatchedValues: z.ZodNumber;
    }, z.core.$strict>;
    issues: z.ZodObject<{
        exact: z.ZodNumber;
        missing: z.ZodNumber;
        extra: z.ZodNumber;
        reordered: z.ZodNumber;
    }, z.core.$strict>;
    evidence: z.ZodObject<{
        exact: z.ZodNumber;
        missing: z.ZodNumber;
        extra: z.ZodNumber;
        invalidSource: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>>;
export type EvalAggregateScorecard = z.infer<typeof EvalAggregateScorecardSchema>;
export type EvalRunReport = z.infer<typeof EvalRunReportSchema>;
export type SafeEvalFailure = z.infer<typeof SafeEvalFailureSchema>;
export type EvalCaseFailure = z.infer<typeof EvalCaseFailureSchema>;
export type LiveSpendReport = z.infer<typeof LiveSpendReportSchema>;
export type ActualChargeEvidence = z.infer<typeof ActualChargeEvidenceSchema>;
export type NoChargeEvidence = z.infer<typeof NoChargeEvidenceSchema>;
export declare function aggregateReports(scorecards: readonly EvalCaseScorecard[], failures?: readonly unknown[]): EvalAggregateScorecard;
export declare const EvalRunReportSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    runId: z.ZodString;
    mode: z.ZodEnum<{
        offline: "offline";
        live: "live";
    }>;
    corpusId: z.ZodString;
    corpusVersion: z.ZodString;
    selectedCaseIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    scannerVersion: z.ZodString;
    scannerCommit: z.ZodString;
    modelIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    caseScorecards: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        caseId: z.ZodString;
        valid: z.ZodBoolean;
        exact: z.ZodBoolean;
        candidateCount: z.ZodObject<{
            expected: z.ZodNumber;
            actual: z.ZodNumber;
            matched: z.ZodNumber;
            missing: z.ZodNumber;
            extra: z.ZodNumber;
        }, z.core.$strict>;
        fields: z.ZodObject<{
            exactValues: z.ZodNumber;
            exactNulls: z.ZodNumber;
            missingValues: z.ZodNumber;
            fabricatedValues: z.ZodNumber;
            mismatchedValues: z.ZodNumber;
        }, z.core.$strict>;
        issues: z.ZodObject<{
            exact: z.ZodNumber;
            missing: z.ZodNumber;
            extra: z.ZodNumber;
            reordered: z.ZodNumber;
        }, z.core.$strict>;
        evidence: z.ZodObject<{
            exact: z.ZodNumber;
            missing: z.ZodNumber;
            extra: z.ZodNumber;
            invalidSource: z.ZodNumber;
        }, z.core.$strict>;
        violations: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            code: z.ZodEnum<{
                schema_invalid_actual: "schema_invalid_actual";
                candidate_count_mismatch: "candidate_count_mismatch";
                candidate_reordered: "candidate_reordered";
                field_missing: "field_missing";
                field_fabricated: "field_fabricated";
                field_mismatch: "field_mismatch";
                issue_missing: "issue_missing";
                issue_extra: "issue_extra";
                issue_reordered: "issue_reordered";
                evidence_missing: "evidence_missing";
                evidence_extra: "evidence_extra";
                evidence_reordered: "evidence_reordered";
                evidence_unknown_source: "evidence_unknown_source";
            }>;
            candidateIndex: z.ZodNullable<z.ZodNumber>;
            issueIndex: z.ZodNullable<z.ZodNumber>;
            evidenceIndex: z.ZodNullable<z.ZodNumber>;
            fieldPath: z.ZodNullable<z.ZodString>;
            state: z.ZodEnum<{
                invalid: "invalid";
                missing: "missing";
                extra: "extra";
                mismatch: "mismatch";
                reordered: "reordered";
            }>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>>>;
    failures: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        caseId: z.ZodString;
        callId: z.ZodNullable<z.ZodString>;
        failure: z.ZodReadonly<z.ZodObject<{
            code: z.ZodEnum<{
                local_validation: "local_validation";
                source_resolution: "source_resolution";
                transport_network: "transport_network";
                transport_timeout: "transport_timeout";
                transport_http: "transport_http";
                privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
                provider_refusal: "provider_refusal";
                provider_empty: "provider_empty";
                provider_malformed: "provider_malformed";
                observation_invalid: "observation_invalid";
                billing_evidence_missing: "billing_evidence_missing";
                billing_evidence_invalid: "billing_evidence_invalid";
            }>;
            retryable: z.ZodBoolean;
            httpStatus: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>>>;
    aggregate: z.ZodReadonly<z.ZodObject<{
        caseCount: z.ZodNumber;
        completedCaseCount: z.ZodNumber;
        failedCaseCount: z.ZodNumber;
        exactCaseCount: z.ZodNumber;
        expectedCandidateCount: z.ZodNumber;
        actualCandidateCount: z.ZodNumber;
        missingCandidateCount: z.ZodNumber;
        unexpectedCandidateCount: z.ZodNumber;
        reorderedCandidateCount: z.ZodNumber;
        invalidActualCount: z.ZodNumber;
        violationCount: z.ZodNumber;
        fields: z.ZodObject<{
            exactValues: z.ZodNumber;
            exactNulls: z.ZodNumber;
            missingValues: z.ZodNumber;
            fabricatedValues: z.ZodNumber;
            mismatchedValues: z.ZodNumber;
        }, z.core.$strict>;
        issues: z.ZodObject<{
            exact: z.ZodNumber;
            missing: z.ZodNumber;
            extra: z.ZodNumber;
            reordered: z.ZodNumber;
        }, z.core.$strict>;
        evidence: z.ZodObject<{
            exact: z.ZodNumber;
            missing: z.ZodNumber;
            extra: z.ZodNumber;
            invalidSource: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    spend: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
        weekKey: z.ZodString;
        reservationId: z.ZodString;
        reservationState: z.ZodEnum<{
            open: "open";
            closed: "closed";
            unresolved: "unresolved";
        }>;
        settledActualMicros: z.ZodNumber;
        heldMicros: z.ZodNumber;
        actualEvidenceIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        noChargeProofIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>>;
}, z.core.$strict>>;
/** Deterministic safe projection of validated report JSON; no payload-bearing fields are rendered. */
export declare function renderMarkdown(input: unknown): string;
//# sourceMappingURL=report.d.ts.map