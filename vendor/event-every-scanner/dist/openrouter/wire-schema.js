import { z } from "zod";
import { CandidateFieldSchema, ISSUE_TRAITS, IssueCodeSchema, ProviderScanObservationSchema, RecurrenceClaimSchema, TemporalClaimSchema, } from "../contracts.js";
import { assertUniqueProviderSourceIds } from "../provider-ports.js";
// ---------------------------------------------------------------------------
// 1. Wire-only strict schemas (no kind/severity – those are derived)
// ---------------------------------------------------------------------------
const WireEvidenceRefSchema = z
    .strictObject({
    sourceId: z.string().min(1),
    locator: z.string().min(1).max(240).nullable(),
    excerpt: z.string().max(240).nullable(),
    startOffset: z.number().int().nonnegative().nullable(),
    endOffset: z.number().int().nonnegative().nullable(),
})
    .refine(({ startOffset, endOffset }) => (startOffset === null && endOffset === null) ||
    (startOffset !== null &&
        endOffset !== null &&
        endOffset >= startOffset), {
    message: "Evidence offsets must both be null or form a non-negative ordered range.",
})
    .readonly();
const wireClaimedFieldSchema = (valueSchema) => z
    .strictObject({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    evidence: z.array(WireEvidenceRefSchema).readonly(),
})
    .readonly();
const WireIssueSchema = z
    .strictObject({
    code: IssueCodeSchema,
    field: z.union([
        CandidateFieldSchema,
        z.literal("candidate"),
        z.literal("scan"),
    ]),
    message: z.string().min(1),
    evidence: z.array(WireEvidenceRefSchema).readonly(),
})
    .readonly();
const WireCandidateObservationSchema = z
    .strictObject({
    sourceUid: z.string().min(1).nullable(),
    title: wireClaimedFieldSchema(z.string()),
    description: wireClaimedFieldSchema(z.string()),
    location: wireClaimedFieldSchema(z.string()),
    url: wireClaimedFieldSchema(z.string()),
    temporal: wireClaimedFieldSchema(TemporalClaimSchema),
    recurrence: wireClaimedFieldSchema(RecurrenceClaimSchema),
    issues: z.array(WireIssueSchema).readonly(),
})
    .readonly();
export const WireProviderScanObservationSchema = z
    .strictObject({
    candidates: z.array(WireCandidateObservationSchema).readonly(),
    issues: z.array(WireIssueSchema).readonly(),
})
    .readonly();
// ---------------------------------------------------------------------------
// 2. Generated draft-07 JSON Schema for strict response_format
// ---------------------------------------------------------------------------
export const OPENROUTER_OBSERVATION_JSON_SCHEMA = z.toJSONSchema(WireProviderScanObservationSchema, {
    target: "draft-07",
    reused: "inline",
    cycles: "throw",
    unrepresentable: "throw",
});
// ---------------------------------------------------------------------------
// 3. Wire-to-runtime observation conversion
// ---------------------------------------------------------------------------
/**
 * Convert a parsed wire observation into the runtime ProviderScanObservation.
 *
 * Validation performed:
 * - Every evidence sourceId must belong to the supplied sources.
 * - Image evidence must have null offsets.
 * - Text/link offsets must be either both null or within the source text bounds.
 * - Issue kind and severity are derived from ISSUE_TRAITS, never trusted from the model.
 * - The final result passes ProviderScanObservationSchema.parse().
 */
export function observationFromWire(input, sources) {
    // Step 1: Parse the wire format (throws ZodError on schema violation)
    const wire = WireProviderScanObservationSchema.parse(input);
    // Step 2: Build a sourceId → source lookup
    assertUniqueProviderSourceIds(sources);
    const sourceMap = new Map();
    for (const source of sources) {
        sourceMap.set(source.sourceId, source);
    }
    // Step 3: Helper to validate a single evidence ref
    function validateEvidence(ev, candidateLabel) {
        const source = sourceMap.get(ev.sourceId);
        if (!source) {
            throw new z.ZodError([
                {
                    code: "custom",
                    message: `Evidence references unknown sourceId "${ev.sourceId}"`,
                    path: [candidateLabel, "evidence", ev.sourceId],
                },
            ]);
        }
        if (source.kind === "image") {
            // Image evidence must have null offsets
            if (ev.startOffset !== null || ev.endOffset !== null) {
                throw new z.ZodError([
                    {
                        code: "custom",
                        message: `Image evidence must have null offsets, got startOffset=${ev.startOffset} endOffset=${ev.endOffset}`,
                        path: [candidateLabel, "evidence", ev.sourceId, "startOffset"],
                    },
                ]);
            }
        }
        else if (ev.startOffset !== null && ev.endOffset !== null) {
            // Text/link offsets must be within bounds - but an offset is a citation,
            // not the value. It says WHERE a value was read from. Models get the value
            // right and miscount the position, and rejecting the observation for that
            // throws away a correct extraction over a bad footnote.
            //
            // So an out-of-range position is dropped rather than fatal. Both offsets
            // go to null together, which the wire schema requires and which reads as
            // "location unknown"; clamping to the source length would instead assert a
            // position the model never claimed.
            if (ev.endOffset > source.text.length) {
                return { ...ev, startOffset: null, endOffset: null };
            }
        }
        return ev;
    }
    // Step 4: Validate all evidence across candidates and scan-level issues
    function collectAndValidateIssues(wireIssues, label) {
        return wireIssues.map((wi) => {
            const issueEvidence = wi.evidence.map((ev) => validateEvidence(ev, label));
            const traits = ISSUE_TRAITS[wi.code];
            const scannerIssue = {
                code: wi.code,
                kind: traits.kind,
                severity: traits.severity,
                field: wi.field,
                message: wi.message,
                evidence: issueEvidence,
            };
            return scannerIssue;
        });
    }
    // Step 5: Convert wire candidates to runtime candidates
    const candidates = wire.candidates.map((wc, ci) => {
        const checked = (refs) => refs.map((ev) => validateEvidence(ev, `candidates[${ci}]`));
        const candidateIssues = collectAndValidateIssues(wc.issues, `candidates[${ci}]`);
        return {
            sourceUid: wc.sourceUid,
            title: { ...wc.title, evidence: checked(wc.title.evidence) },
            description: { ...wc.description, evidence: checked(wc.description.evidence) },
            location: { ...wc.location, evidence: checked(wc.location.evidence) },
            url: { ...wc.url, evidence: checked(wc.url.evidence) },
            temporal: { ...wc.temporal, evidence: checked(wc.temporal.evidence) },
            recurrence: { ...wc.recurrence, evidence: checked(wc.recurrence.evidence) },
            issues: candidateIssues,
        };
    });
    const scanIssues = collectAndValidateIssues(wire.issues, "scan");
    const result = {
        candidates,
        issues: scanIssues,
    };
    // Step 6: Final validation against the runtime schema
    return ProviderScanObservationSchema.parse(result);
}
//# sourceMappingURL=wire-schema.js.map