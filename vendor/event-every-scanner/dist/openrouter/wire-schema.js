import { z } from "zod";
import { ByDaySchema, CandidateFieldSchema, CompleteDateSchema, CompleteTimeSchema, DatePointSchema, FloatingPointSchema, ISSUE_TRAITS, IssueCodeSchema, PartialPointSchema, ProviderScanObservationSchema, } from "../contracts.js";
import { assertUniqueProviderSourceIds } from "../provider-ports.js";
// ---------------------------------------------------------------------------
// 1. Wire-only strict schemas (no kind/severity – those are derived)
// ---------------------------------------------------------------------------
// The wire is what the model must WRITE, and every token it writes is billed
// at four times the input rate. Measured on real scans: evidence bookkeeping
// (locator, character offsets) and zone-resolution fields were over half of
// every answer, and no consumer ever read them - hosts project evidence to []
// and the resolver recomputes offsets from the zone. So the wire carries only
// what a model can actually know: which source, and the words it read.
const WireEvidenceRefSchema = z
    .strictObject({
    sourceId: z.string().min(1),
    excerpt: z.string().max(240).nullable(),
})
    .readonly();
function evidenceFromWire(ev) {
    return { sourceId: ev.sourceId, locator: null, excerpt: ev.excerpt, startOffset: null, endOffset: null };
}
// A zoned point on the wire is the local date, time, and zone the source
// stated, plus the UTC offset if the source printed one. Whether that local
// time exists once, twice, or not at all in that zone is the resolver's job
// (resolveZonedPoint), never the model's.
const WireZonedPointSchema = z
    .strictObject({
    kind: z.literal("zoned"),
    date: CompleteDateSchema,
    time: CompleteTimeSchema,
    timeZone: z.string().min(1),
    sourceOffset: z.string().min(1).nullable(),
})
    .readonly();
const WireTemporalPointSchema = z.discriminatedUnion("kind", [
    DatePointSchema,
    FloatingPointSchema,
    WireZonedPointSchema,
    PartialPointSchema,
]);
const WireTemporalClaimSchema = z
    .strictObject({
    start: WireTemporalPointSchema.nullable(),
    end: WireTemporalPointSchema.nullable(),
    duration: z.string().min(1).nullable(),
    allDay: z.union([z.boolean(), z.literal("unknown")]),
})
    .readonly();
const WireRecurrenceRuleSchema = z
    .strictObject({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().positive().nullable(),
    count: z.number().int().positive().nullable(),
    until: WireTemporalPointSchema.nullable(),
    byMonth: z.array(z.number().int().min(1).max(12)).readonly(),
    byMonthDay: z
        .array(z.number().int().min(-31).max(31).refine((day) => day !== 0))
        .readonly(),
    byDay: z.array(ByDaySchema).readonly(),
    weekStart: z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]).nullable(),
})
    .readonly();
const WireRecurrenceClaimSchema = z
    .strictObject({
    rule: WireRecurrenceRuleSchema,
    rDates: z.array(WireTemporalPointSchema).readonly(),
    exDates: z.array(WireTemporalPointSchema).readonly(),
})
    .readonly();
function pointFromWire(point) {
    if (point === null || point.kind !== "zoned")
        return point;
    return {
        kind: "zoned",
        date: point.date,
        time: point.time,
        timeZone: point.timeZone,
        resolution: "exact",
        possibleOffsets: [],
        sourceOffset: point.sourceOffset,
        chosenOffset: null,
    };
}
function temporalFromWire(claim) {
    if (claim === null)
        return null;
    return { ...claim, start: pointFromWire(claim.start), end: pointFromWire(claim.end) };
}
function recurrenceFromWire(claim) {
    if (claim === null)
        return null;
    return {
        rule: { ...claim.rule, until: pointFromWire(claim.rule.until) },
        rDates: claim.rDates.map((point) => pointFromWire(point)),
        exDates: claim.exDates.map((point) => pointFromWire(point)),
    };
}
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
    temporal: wireClaimedFieldSchema(WireTemporalClaimSchema),
    recurrence: wireClaimedFieldSchema(WireRecurrenceClaimSchema),
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
        if (!sourceMap.has(ev.sourceId)) {
            throw new z.ZodError([
                {
                    code: "custom",
                    message: `Evidence references unknown sourceId "${ev.sourceId}"`,
                    path: [candidateLabel, "evidence", ev.sourceId],
                },
            ]);
        }
        return evidenceFromWire(ev);
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
            temporal: { ...wc.temporal, value: temporalFromWire(wc.temporal.value), evidence: checked(wc.temporal.evidence) },
            recurrence: { ...wc.recurrence, value: recurrenceFromWire(wc.recurrence.value), evidence: checked(wc.recurrence.evidence) },
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