import { z } from "zod";
const NonEmpty = z.string().min(1);
const NonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const SchemaVersion = z.literal(1);
const EvalViolationSchema = z.strictObject({
    code: z.enum(["schema_invalid_actual", "candidate_count_mismatch", "candidate_reordered", "field_missing", "field_fabricated", "field_mismatch", "issue_missing", "issue_extra", "issue_reordered", "evidence_missing", "evidence_extra", "evidence_reordered", "evidence_unknown_source"]),
    candidateIndex: NonNegativeInteger.nullable(), issueIndex: NonNegativeInteger.nullable(), evidenceIndex: NonNegativeInteger.nullable(),
    fieldPath: z.string().min(1).nullable(), state: z.enum(["missing", "extra", "mismatch", "invalid", "reordered"]),
});
const CountComparisonSchema = z.strictObject({ expected: NonNegativeInteger, actual: NonNegativeInteger, matched: NonNegativeInteger, missing: NonNegativeInteger, extra: NonNegativeInteger });
const FieldSummarySchema = z.strictObject({ exactValues: NonNegativeInteger, exactNulls: NonNegativeInteger, missingValues: NonNegativeInteger, fabricatedValues: NonNegativeInteger, mismatchedValues: NonNegativeInteger });
const IssueSummarySchema = z.strictObject({ exact: NonNegativeInteger, missing: NonNegativeInteger, extra: NonNegativeInteger, reordered: NonNegativeInteger });
const EvidenceSummarySchema = z.strictObject({ exact: NonNegativeInteger, missing: NonNegativeInteger, extra: NonNegativeInteger, invalidSource: NonNegativeInteger });
const EvalCaseScorecardSchema = z.strictObject({ caseId: NonEmpty, valid: z.boolean(), exact: z.boolean(), candidateCount: CountComparisonSchema, fields: FieldSummarySchema, issues: IssueSummarySchema, evidence: EvidenceSummarySchema, violations: z.array(EvalViolationSchema).readonly() }).readonly();
export const SafeEvalFailureSchema = z.strictObject({
    code: z.enum(["local_validation", "source_resolution", "transport_network", "transport_timeout", "transport_http", "privacy_endpoint_unavailable", "provider_refusal", "provider_empty", "provider_malformed", "observation_invalid", "billing_evidence_missing", "billing_evidence_invalid"]),
    retryable: z.boolean(), httpStatus: z.number().int().min(100).max(599).nullable(),
}).readonly();
export const EvalCaseFailureSchema = z.strictObject({ caseId: NonEmpty, callId: NonEmpty.nullable(), failure: SafeEvalFailureSchema }).readonly();
export const ActualChargeEvidenceSchema = z.strictObject({ schemaVersion: SchemaVersion, evidenceId: NonEmpty, callId: NonEmpty, reservationId: NonEmpty, providerRequestIdDigest: z.string().regex(/^[a-f0-9]{64}$/i), chargedMicros: NonNegativeInteger, admittedAt: z.string().datetime() }).readonly();
export const NoChargeEvidenceSchema = z.strictObject({ schemaVersion: SchemaVersion, proofId: NonEmpty, callId: NonEmpty, reservationId: NonEmpty, reason: z.enum(["local_validation_before_transport", "week_rollover_before_transport", "transport_refused_before_admission"]) }).readonly();
export const LiveSpendReportSchema = z.strictObject({ weekKey: z.string().regex(/^openrouter-budget:\d{4}-W\d{2}$/), reservationId: NonEmpty, reservationState: z.enum(["open", "closed", "unresolved"]), settledActualMicros: NonNegativeInteger, heldMicros: NonNegativeInteger, actualEvidenceIds: z.array(NonEmpty).readonly(), noChargeProofIds: z.array(NonEmpty).readonly() }).readonly();
export const EvalAggregateScorecardSchema = z.strictObject({
    caseCount: NonNegativeInteger, completedCaseCount: NonNegativeInteger, failedCaseCount: NonNegativeInteger, exactCaseCount: NonNegativeInteger,
    expectedCandidateCount: NonNegativeInteger, actualCandidateCount: NonNegativeInteger, missingCandidateCount: NonNegativeInteger, unexpectedCandidateCount: NonNegativeInteger, reorderedCandidateCount: NonNegativeInteger, invalidActualCount: NonNegativeInteger, violationCount: NonNegativeInteger,
    fields: FieldSummarySchema, issues: IssueSummarySchema, evidence: EvidenceSummarySchema,
}).superRefine((value, context) => {
    if (value.caseCount !== value.completedCaseCount + value.failedCaseCount || value.exactCaseCount > value.completedCaseCount)
        context.addIssue({ code: "custom", message: "aggregate_invalid" });
}).readonly();
function sum(values, select) { return values.reduce((total, value) => total + select(value), 0); }
export function aggregateReports(scorecards, failures = []) {
    const cards = scorecards.map((scorecard) => EvalCaseScorecardSchema.parse(scorecard));
    const validatedFailures = failures.map((failure) => EvalCaseFailureSchema.parse(failure));
    const aggregate = {
        caseCount: cards.length + validatedFailures.length, completedCaseCount: cards.length, failedCaseCount: validatedFailures.length, exactCaseCount: cards.filter((card) => card.exact).length,
        expectedCandidateCount: sum(cards, (card) => card.candidateCount.expected), actualCandidateCount: sum(cards, (card) => card.candidateCount.actual), missingCandidateCount: sum(cards, (card) => card.candidateCount.missing), unexpectedCandidateCount: sum(cards, (card) => card.candidateCount.extra), reorderedCandidateCount: sum(cards, (card) => card.violations.filter((violation) => violation.code === "candidate_reordered").length), invalidActualCount: cards.filter((card) => !card.valid).length, violationCount: sum(cards, (card) => card.violations.length),
        fields: { exactValues: sum(cards, (card) => card.fields.exactValues), exactNulls: sum(cards, (card) => card.fields.exactNulls), missingValues: sum(cards, (card) => card.fields.missingValues), fabricatedValues: sum(cards, (card) => card.fields.fabricatedValues), mismatchedValues: sum(cards, (card) => card.fields.mismatchedValues) },
        issues: { exact: sum(cards, (card) => card.issues.exact), missing: sum(cards, (card) => card.issues.missing), extra: sum(cards, (card) => card.issues.extra), reordered: sum(cards, (card) => card.issues.reordered) },
        evidence: { exact: sum(cards, (card) => card.evidence.exact), missing: sum(cards, (card) => card.evidence.missing), extra: sum(cards, (card) => card.evidence.extra), invalidSource: sum(cards, (card) => card.evidence.invalidSource) },
    };
    return EvalAggregateScorecardSchema.parse(aggregate);
}
const EvalRunReportBaseSchema = z.strictObject({
    schemaVersion: SchemaVersion, runId: NonEmpty, mode: z.enum(["offline", "live"]), corpusId: NonEmpty, corpusVersion: NonEmpty,
    selectedCaseIds: z.array(NonEmpty).readonly(), scannerVersion: NonEmpty, scannerCommit: NonEmpty, modelIds: z.array(NonEmpty).readonly(),
    startedAt: z.string().datetime(), endedAt: z.string().datetime(), caseScorecards: z.array(EvalCaseScorecardSchema).readonly(), failures: z.array(EvalCaseFailureSchema).readonly(), aggregate: EvalAggregateScorecardSchema, spend: LiveSpendReportSchema.nullable(),
});
export const EvalRunReportSchema = EvalRunReportBaseSchema.superRefine((value, context) => {
    const expected = aggregateReports(value.caseScorecards, value.failures);
    if (JSON.stringify(expected) !== JSON.stringify(value.aggregate))
        context.addIssue({ code: "custom", path: ["aggregate"], message: "aggregate_invalid" });
    const completedIds = value.caseScorecards.map((scorecard) => scorecard.caseId);
    const failedIds = value.failures.map((failure) => failure.caseId);
    const selectedIds = value.selectedCaseIds;
    const selectedCompleted = selectedIds.filter((id) => completedIds.includes(id));
    const selectedFailed = selectedIds.filter((id) => failedIds.includes(id));
    const allCaseIds = [...completedIds, ...failedIds];
    if (selectedIds.length !== allCaseIds.length || new Set(selectedIds).size !== selectedIds.length || new Set(allCaseIds).size !== allCaseIds.length || selectedCompleted.some((id, index) => id !== completedIds[index]) || selectedFailed.some((id, index) => id !== failedIds[index]) || selectedIds.some((id) => !allCaseIds.includes(id)))
        context.addIssue({ code: "custom", path: ["selectedCaseIds"], message: "case_order_invalid" });
    if (value.mode === "offline" && value.spend !== null)
        context.addIssue({ code: "custom", path: ["spend"], message: "offline_spend_invalid" });
    if ((value.mode === "offline" && value.modelIds.length !== 0) || (value.mode === "live" && value.modelIds.length === 0))
        context.addIssue({ code: "custom", path: ["modelIds"], message: "model_policy_invalid" });
}).readonly();
function line(label, value) { return `- ${label}: ${value}`; }
/** Deterministic safe projection of validated report JSON; no payload-bearing fields are rendered. */
export function renderMarkdown(input) {
    const report = EvalRunReportSchema.parse(input);
    const aggregate = report.aggregate;
    const lines = [
        "# Event Scanner Evaluation Report", "", "## Run", line("Mode", report.mode), line("Selected cases", report.selectedCaseIds.length), line("Models", report.modelIds.length), "",
        "## Aggregate", line("Cases", aggregate.caseCount), line("Completed", aggregate.completedCaseCount), line("Failed", aggregate.failedCaseCount), line("Exact", aggregate.exactCaseCount), line("Violations", aggregate.violationCount), line("Expected candidates", aggregate.expectedCandidateCount), line("Actual candidates", aggregate.actualCandidateCount), line("Missing candidates", aggregate.missingCandidateCount), line("Unexpected candidates", aggregate.unexpectedCandidateCount), line("Reordered candidates", aggregate.reorderedCandidateCount), line("Invalid actuals", aggregate.invalidActualCount), "",
        "## Failures",
    ];
    if (report.failures.length === 0)
        lines.push("- None");
    else
        for (const failure of report.failures)
            lines.push(`- ${failure.failure.code}${failure.failure.httpStatus === null ? "" : ` (${failure.failure.httpStatus})`}`);
    lines.push("", "## Spend");
    if (report.spend === null)
        lines.push("- None");
    else
        lines.push(line("Week", report.spend.weekKey), line("Reservation state", report.spend.reservationState), line("Settled micros", report.spend.settledActualMicros), line("Held micros", report.spend.heldMicros));
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=report.js.map