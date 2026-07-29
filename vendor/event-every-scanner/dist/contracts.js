import { z } from "zod";
const nullableInteger = (minimum, maximum) => z.number().int().min(minimum).max(maximum).nullable();
export const EvidenceRefSchema = z
    .strictObject({
    sourceId: z.string().min(1),
    locator: z.string().min(1).nullable(),
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
const claimedFieldSchema = (valueSchema) => z
    .strictObject({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    evidence: z.array(EvidenceRefSchema).readonly(),
})
    .readonly();
export const CompleteDateSchema = z
    .strictObject({
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
})
    .readonly();
export const CompleteTimeSchema = z
    .strictObject({
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    second: z.number().int().min(0).max(59),
})
    .readonly();
const DatePointSchema = z
    .strictObject({
    kind: z.literal("date"),
    year: nullableInteger(1, 9999),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
})
    .readonly();
const FloatingPointSchema = z
    .strictObject({
    kind: z.literal("floating"),
    date: CompleteDateSchema,
    time: CompleteTimeSchema,
})
    .readonly();
const ZonedPointSchema = z
    .strictObject({
    kind: z.literal("zoned"),
    date: CompleteDateSchema,
    time: CompleteTimeSchema,
    timeZone: z.string().min(1),
    resolution: z.enum(["exact", "gap", "fold", "offset_resolved"]),
    possibleOffsets: z.array(z.string().min(1)).readonly(),
    sourceOffset: z.string().min(1).nullable(),
    chosenOffset: z.string().min(1).nullable(),
})
    .readonly();
const PartialPointSchema = z
    .strictObject({
    kind: z.literal("partial"),
    year: nullableInteger(1, 9999),
    month: nullableInteger(1, 12),
    day: nullableInteger(1, 31),
    hour: nullableInteger(0, 23),
    minute: nullableInteger(0, 59),
    second: nullableInteger(0, 59),
})
    .readonly();
export const TemporalPointSchema = z.discriminatedUnion("kind", [
    DatePointSchema,
    FloatingPointSchema,
    ZonedPointSchema,
    PartialPointSchema,
]);
export const TemporalClaimSchema = z
    .strictObject({
    start: TemporalPointSchema.nullable(),
    end: TemporalPointSchema.nullable(),
    duration: z.string().min(1).nullable(),
    allDay: z.union([z.boolean(), z.literal("unknown")]),
})
    .readonly();
export const ByDaySchema = z
    .strictObject({
    ordinal: z.number().int().min(-53).max(53).nullable(),
    weekday: z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]),
})
    .readonly();
export const RecurrenceRuleSchema = z
    .strictObject({
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().positive().nullable(),
    count: z.number().int().positive().nullable(),
    until: TemporalPointSchema.nullable(),
    byMonth: z.array(z.number().int().min(1).max(12)).readonly(),
    byMonthDay: z
        .array(z.number().int().min(-31).max(31).refine((day) => day !== 0))
        .readonly(),
    byDay: z.array(ByDaySchema).readonly(),
    weekStart: z
        .enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])
        .nullable(),
})
    .readonly();
export const RecurrenceClaimSchema = z
    .strictObject({
    rule: RecurrenceRuleSchema,
    rDates: z.array(TemporalPointSchema).readonly(),
    exDates: z.array(TemporalPointSchema).readonly(),
})
    .readonly();
export const StringClaimSchema = claimedFieldSchema(z.string());
export const TemporalClaimFieldSchema = claimedFieldSchema(TemporalClaimSchema);
export const RecurrenceClaimFieldSchema = claimedFieldSchema(RecurrenceClaimSchema);
export const CandidateFieldSchema = z.enum([
    "sourceUid",
    "title",
    "description",
    "location",
    "url",
    "temporal",
    "recurrence",
]);
export const IssueKindSchema = z.enum([
    "not_found",
    "incomplete",
    "ambiguous",
    "conflicting",
    "invalid",
    "unsupported",
]);
export const IssueSeveritySchema = z.enum(["blocker", "warning"]);
export const IssueCodeSchema = z.enum([
    "field_not_found",
    "field_incomplete",
    "field_ambiguous",
    "field_conflicting",
    "invalid_url",
    "invalid_date",
    "invalid_time",
    "invalid_time_zone",
    "invalid_duration",
    "missing_start",
    "missing_year",
    "unknown_all_day",
    "floating_time",
    "dst_gap",
    "dst_fold",
    "offset_mismatch",
    "end_before_start",
    "end_duration_conflict",
    "incompatible_temporal_kinds",
    "invalid_recurrence",
    "unsupported_recurrence",
    "missing_export_uid",
    "invalid_dtstamp",
    "invalid_prodid",
    "malformed_ics",
]);
export const ISSUE_TRAITS = {
    field_not_found: { kind: "not_found", severity: "warning" },
    field_incomplete: { kind: "incomplete", severity: "blocker" },
    field_ambiguous: { kind: "ambiguous", severity: "blocker" },
    field_conflicting: { kind: "conflicting", severity: "blocker" },
    invalid_url: { kind: "invalid", severity: "blocker" },
    invalid_date: { kind: "invalid", severity: "blocker" },
    invalid_time: { kind: "invalid", severity: "blocker" },
    invalid_time_zone: { kind: "invalid", severity: "blocker" },
    invalid_duration: { kind: "invalid", severity: "blocker" },
    missing_start: { kind: "incomplete", severity: "blocker" },
    missing_year: { kind: "incomplete", severity: "blocker" },
    unknown_all_day: { kind: "ambiguous", severity: "blocker" },
    floating_time: { kind: "ambiguous", severity: "warning" },
    dst_gap: { kind: "ambiguous", severity: "blocker" },
    dst_fold: { kind: "ambiguous", severity: "blocker" },
    offset_mismatch: { kind: "conflicting", severity: "blocker" },
    end_before_start: { kind: "conflicting", severity: "blocker" },
    end_duration_conflict: { kind: "conflicting", severity: "blocker" },
    incompatible_temporal_kinds: {
        kind: "conflicting",
        severity: "blocker",
    },
    invalid_recurrence: { kind: "invalid", severity: "blocker" },
    unsupported_recurrence: { kind: "unsupported", severity: "blocker" },
    missing_export_uid: { kind: "incomplete", severity: "blocker" },
    invalid_dtstamp: { kind: "invalid", severity: "blocker" },
    invalid_prodid: { kind: "invalid", severity: "blocker" },
    malformed_ics: { kind: "invalid", severity: "blocker" },
};
export const ScannerIssueSchema = z
    .strictObject({
    code: IssueCodeSchema,
    kind: IssueKindSchema,
    severity: IssueSeveritySchema,
    field: z.union([
        CandidateFieldSchema,
        z.literal("candidate"),
        z.literal("scan"),
    ]),
    message: z.string().min(1),
    evidence: z.array(EvidenceRefSchema).readonly(),
})
    .superRefine((value, context) => {
    const expected = ISSUE_TRAITS[value.code];
    if (value.kind !== expected.kind) {
        context.addIssue({
            code: "custom",
            path: ["kind"],
            message: `${value.code} requires kind ${expected.kind}.`,
        });
    }
    if (value.severity !== expected.severity) {
        context.addIssue({
            code: "custom",
            path: ["severity"],
            message: `${value.code} requires severity ${expected.severity}.`,
        });
    }
})
    .readonly();
const candidateClaimsShape = {
    sourceUid: z.string().min(1).nullable(),
    title: StringClaimSchema,
    description: StringClaimSchema,
    location: StringClaimSchema,
    url: StringClaimSchema,
    temporal: TemporalClaimFieldSchema,
    recurrence: RecurrenceClaimFieldSchema,
    issues: z.array(ScannerIssueSchema).readonly(),
};
export const CandidateObservationSchema = z
    .strictObject(candidateClaimsShape)
    .readonly();
export const EventCandidateSchema = z
    .strictObject({
    candidateId: z.string().min(1),
    ...candidateClaimsShape,
})
    .readonly();
const sourceHandleSchema = (kind) => z
    .strictObject({
    sourceId: z.string().min(1),
    kind: z.literal(kind),
    contentHandle: z.string().min(1),
})
    .readonly();
export const SourceHandleSchema = z.discriminatedUnion("kind", [
    sourceHandleSchema("text"),
    sourceHandleSchema("link"),
    sourceHandleSchema("image"),
]);
export const ProviderScanObservationSchema = z
    .strictObject({
    candidates: z.array(CandidateObservationSchema).readonly(),
    issues: z.array(ScannerIssueSchema).readonly(),
})
    .readonly();
//# sourceMappingURL=contracts.js.map