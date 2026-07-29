import { z } from "zod";
import { ProviderScanObservationSchema, } from "../contracts.js";
const BoundedId = z.string().min(1).max(128);
const OpaqueReference = z.string().min(1).max(256);
const IsoTimestamp = z.string().datetime({ offset: true });
const CanonicalIsoTimestamp = IsoTimestamp.refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    new Date(value).toISOString() === value);
const LowercaseSha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const PositiveSafeInteger = z.number().int().safe().positive();
const NonnegativeSafeInteger = z.number().int().safe().nonnegative();
export const CaptureEligibilityInputSchema = z.strictObject({
    authentication: z.literal("verified_email"),
    email: z.string().min(1).max(254),
    subjectId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128),
});
export const SnapshotBindingSchema = z.strictObject({
    snapshotBindingVersion: z.literal(1),
    macKeyVersion: PositiveSafeInteger,
    value: LowercaseSha256,
});
export const CaptureStateSchema = z.enum([
    "preparing",
    "prepared",
    "provider_inflight",
    "completed",
    "scan_failed",
    "scan_outcome_unknown",
    "reviewed",
    "promoted",
    "rejected",
    "deletion_pending",
    "deleted",
]);
export const GoldenStateSchema = z.enum([
    "active",
    "retirement_pending",
    "retired",
]);
export const RouteKindSchema = z.enum(["text_link", "vision"]);
export const ObjectClassSchema = z.enum([
    "capture_source",
    "capture_outcome",
    "private_golden",
    "private_eval_report",
    "private_screenshot",
    "private_markdown_report",
]);
export const CaptureActionSchema = z.enum([
    "create_intent",
    "commit_source",
    "claim_admission",
    "record_success",
    "record_failure",
    "expire_unknown_call",
    "mark_reviewed",
    "reject",
    "request_deletion",
    "finish_deletion",
    "request_retirement",
    "finish_retirement",
    "list_summaries",
    "decrypt_open",
    "extend_retention",
    "delete_derivatives",
    "re_encrypt",
    "retire_key",
    "reconcile",
]);
export const CapabilitySchema = z.enum([
    "capture.review",
    "capture.retain",
    "capture.delete",
    "capture.delete_derivatives",
    "capture.key_admin",
    "capture.reconcile",
]);
export const AuditActionSchema = z.enum([
    "capture_prepare",
    "capture_claim_admission",
    "capture_record_success",
    "capture_record_failure",
    "capture_list",
    "capture_decrypt",
    "capture_review",
    "capture_promote",
    "capture_reject",
    "capture_retention_extend",
    "capture_delete",
    "capture_delete_derivatives",
    "capture_reencrypt",
    "capture_retire_key",
    "capture_reconcile",
    "golden_retire",
]);
export const CaptureFailureCodeSchema = z.enum([
    "capture_invalid_input",
    "capture_unavailable",
    "capture_unauthorized",
    "capture_idempotency_conflict",
    "capture_binding_mismatch",
    "capture_state_conflict",
    "capture_generation_conflict",
    "capture_delete_incomplete",
    "capture_corrupt",
    "capture_confirmation_invalid",
    "capture_provider_failed",
    "capture_outcome_unknown",
    "provider_outcome_uncertain",
    "outcome_record_unavailable",
]);
export const CaptureHttpStatusSchema = z.union([
    z.literal(400),
    z.literal(401),
    z.literal(403),
    z.literal(404),
    z.literal(409),
    z.literal(413),
    z.literal(429),
    z.literal(500),
    z.literal(502),
    z.literal(503),
    z.literal(504),
]);
export const CaptureFailureSchema = z.strictObject({
    code: CaptureFailureCodeSchema,
    retryable: z.boolean(),
    httpStatus: CaptureHttpStatusSchema.or(z.null()),
});
export const EncryptedArtifactMetadataSchema = z.strictObject({
    objectId: BoundedId,
    objectHandle: OpaqueReference,
    objectClass: ObjectClassSchema,
    schemaVersion: PositiveSafeInteger,
    keyVersion: PositiveSafeInteger,
    generation: PositiveSafeInteger,
    ciphertextSha256: LowercaseSha256,
    ciphertextLength: NonnegativeSafeInteger,
});
export const CaptureReceiptSchema = z.strictObject({
    captureId: BoundedId,
    subjectRef: OpaqueReference,
    snapshotHandle: OpaqueReference,
    snapshotBinding: SnapshotBindingSchema,
    routeKind: RouteKindSchema,
    schemaVersion: PositiveSafeInteger,
    state: CaptureStateSchema,
    stateVersion: PositiveSafeInteger,
    operationId: BoundedId,
    generation: PositiveSafeInteger,
    leaseExpiresAt: IsoTimestamp,
    executionId: BoundedId.nullable(),
});
const CaptureCatalogRecordBase = {
    captureId: BoundedId,
    subjectRef: OpaqueReference,
    stateVersion: PositiveSafeInteger,
    generation: PositiveSafeInteger,
    schemaVersion: PositiveSafeInteger,
    createdAt: IsoTimestamp,
    completedAt: IsoTimestamp.nullable(),
    reviewedAt: IsoTimestamp.nullable(),
    promotedAt: IsoTimestamp.nullable(),
    rejectedAt: IsoTimestamp.nullable(),
    sourceKind: RouteKindSchema,
    sourceCount: PositiveSafeInteger,
    reviewerSubjectRef: OpaqueReference.nullable(),
    promoterSubjectRef: OpaqueReference.nullable(),
    retentionDeadline: IsoTimestamp,
    goldenId: BoundedId.nullable(),
};
const CaptureCatalogArtifactMetadataSchema = EncryptedArtifactMetadataSchema.extend({
    objectClass: z.enum(["capture_source", "capture_outcome"]),
});
const CaptureCatalogArtifactListSchema = z
    .array(CaptureCatalogArtifactMetadataSchema)
    .min(1)
    .refine((artifacts) => artifacts.some((artifact) => artifact.objectClass === "capture_source"));
const UnlinkedCatalogLifecycle = {
    completedAt: z.null(),
    reviewedAt: z.null(),
    promotedAt: z.null(),
    rejectedAt: z.null(),
    reviewerSubjectRef: z.null(),
    promoterSubjectRef: z.null(),
    goldenId: z.null(),
};
const CompletedCatalogLifecycle = {
    ...UnlinkedCatalogLifecycle,
    completedAt: IsoTimestamp,
};
const ReviewedCatalogLifecycle = {
    ...CompletedCatalogLifecycle,
    reviewedAt: IsoTimestamp,
    reviewerSubjectRef: OpaqueReference,
};
const PromotedCatalogLifecycle = {
    completedAt: IsoTimestamp,
    reviewedAt: IsoTimestamp,
    promotedAt: IsoTimestamp,
    rejectedAt: z.null(),
    reviewerSubjectRef: OpaqueReference,
    promoterSubjectRef: OpaqueReference,
    goldenId: BoundedId,
};
const RejectedFromPreparedCatalogLifecycle = {
    ...UnlinkedCatalogLifecycle,
    rejectedAt: IsoTimestamp,
};
const RejectedFromCompletedCatalogLifecycle = {
    ...CompletedCatalogLifecycle,
    rejectedAt: IsoTimestamp,
};
const RejectedFromReviewedCatalogLifecycle = {
    ...ReviewedCatalogLifecycle,
    rejectedAt: IsoTimestamp,
};
export const CaptureCatalogRecordSchema = z.union([
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...UnlinkedCatalogLifecycle,
        state: z.literal("preparing"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.enum(["prepared", "provider_inflight"]),
        ...UnlinkedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        ...CompletedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("reviewed"),
        ...ReviewedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...PromotedCatalogLifecycle,
        state: z.literal("promoted"),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("rejected"),
        rejectionFencedState: z.literal("prepared"),
        ...RejectedFromPreparedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("rejected"),
        rejectionFencedState: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        ...RejectedFromCompletedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("rejected"),
        rejectionFencedState: z.literal("reviewed"),
        ...RejectedFromReviewedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: z.null(),
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...UnlinkedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("preparing"),
        artifacts: z.array(CaptureCatalogArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.enum(["prepared", "provider_inflight"]),
        ...UnlinkedCatalogLifecycle,
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...CompletedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...ReviewedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("reviewed"),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromPreparedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.literal("prepared"),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromCompletedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromReviewedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.literal("reviewed"),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...PromotedCatalogLifecycle,
        state: z.literal("deletion_pending"),
        deletionFencedState: z.literal("promoted"),
        artifacts: CaptureCatalogArtifactListSchema,
        deletionRequestedAt: IsoTimestamp,
        deletedAt: z.null(),
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        state: z.literal("deleted"),
        ...UnlinkedCatalogLifecycle,
        deletionFencedState: z.literal("preparing"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...UnlinkedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.enum(["prepared", "provider_inflight"]),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...CompletedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...ReviewedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.literal("reviewed"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromPreparedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.literal("prepared"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromCompletedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.enum(["completed", "scan_failed", "scan_outcome_unknown"]),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...RejectedFromReviewedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.literal("rejected"),
        rejectionFencedState: z.literal("reviewed"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
    z.strictObject({
        ...CaptureCatalogRecordBase,
        ...PromotedCatalogLifecycle,
        state: z.literal("deleted"),
        deletionFencedState: z.literal("promoted"),
        artifacts: z.array(EncryptedArtifactMetadataSchema).length(0),
        deletionRequestedAt: IsoTimestamp,
        deletedAt: IsoTimestamp,
    }),
]);
const AuditEventBase = {
    eventId: BoundedId,
    action: AuditActionSchema,
    occurredAt: IsoTimestamp,
    actorRef: OpaqueReference,
    policyVersion: PositiveSafeInteger,
    operationId: BoundedId,
    outcomeCode: z.enum(["success", "denied", "failed", "conflict"]),
};
/** Every audit event belongs to exactly one private catalog entity. */
export const AuditEventSchema = z.union([
    z.strictObject({ ...AuditEventBase, captureId: BoundedId, goldenId: z.null() }),
    z.strictObject({ ...AuditEventBase, captureId: z.null(), goldenId: BoundedId }),
]);
const ReviewedCaptureProvenanceSchema = z.strictObject({
    origin: z.literal("reviewed_private_capture"),
    captureId: BoundedId,
    reviewedAt: CanonicalIsoTimestamp,
    reviewerRef: OpaqueReference,
    policyVersion: z.literal(1),
}).readonly();
const ReviewedGoldenArtifactSchema = z.strictObject({
    objectHandle: OpaqueReference,
    generation: PositiveSafeInteger,
    objectClass: z.literal("private_golden"),
    entityKind: z.literal("golden"),
    entityId: BoundedId,
    createdByOperationId: BoundedId,
    hostValidatedCleanupClaimId: BoundedId,
}).readonly();
/**
 * The expected answer is authored independently during review.  This contract deliberately has
 * no field through which a captured provider observation (or any raw capture value) can enter.
 */
const IndependentlyAuthoredExpectedObservationSchema = ProviderScanObservationSchema.refine(({ candidates, issues }) => candidates.length > 0 || issues.length > 0, { message: "A promotion requires a non-empty independently authored expected observation." });
/** Strict, content-free binding for a reviewed private-capture promotion attempt. */
export const PromotionRequestSchema = z.strictObject({
    captureId: BoundedId,
    goldenId: BoundedId,
    reviewedSnapshotHandle: OpaqueReference,
    reviewedContentBinding: SnapshotBindingSchema,
    expectedStateVersion: PositiveSafeInteger,
    expectedGeneration: PositiveSafeInteger,
    actorRef: OpaqueReference,
    authorizationDecisionId: BoundedId,
    idempotencyId: BoundedId,
    auditEventId: BoundedId,
    confirmationNonce: BoundedId,
    createdArtifact: ReviewedGoldenArtifactSchema,
    expected: IndependentlyAuthoredExpectedObservationSchema,
    provenance: ReviewedCaptureProvenanceSchema,
}).readonly();
const PersistedPromotionBindingSchema = z.strictObject({
    captureId: BoundedId,
    goldenId: BoundedId,
    idempotencyId: BoundedId,
    auditEventId: BoundedId,
    actorRef: OpaqueReference,
    authorizationDecisionId: BoundedId,
    occurredAt: CanonicalIsoTimestamp,
}).readonly();
const retainedFromPromotion = (occurredAt, milliseconds) => {
    const timestamp = Date.parse(occurredAt);
    const deadline = timestamp + milliseconds;
    if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(deadline))
        return null;
    const result = new Date(deadline).toISOString();
    return CanonicalIsoTimestamp.safeParse(result).success ? result : null;
};
/**
 * The complete successful pair persisted by the host's promotion CAS.  An idempotent replay
 * returns this closed record verbatim; it never reconstructs a golden from a later lifecycle.
 */
export const PersistedReviewedCapturePromotionResultSchema = z.strictObject({
    promotion: PersistedPromotionBindingSchema,
    capture: z.strictObject({
        captureId: BoundedId,
        state: z.literal("promoted"),
        stateVersion: PositiveSafeInteger,
        generation: PositiveSafeInteger,
        retentionDeadline: CanonicalIsoTimestamp,
    }).readonly(),
    golden: z.strictObject({
        goldenId: BoundedId,
        captureId: BoundedId,
        state: z.literal("active"),
        stateVersion: z.literal(1),
        generation: z.literal(1),
        artifact: ReviewedGoldenArtifactSchema,
        retentionDeadline: CanonicalIsoTimestamp,
    }).readonly(),
    auditEvent: AuditEventSchema,
    authorizationDecisionId: BoundedId,
}).superRefine((value, context) => {
    const invalid = (path) => {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: "persisted promotion pair binding mismatch" });
    };
    const { promotion, capture, golden, auditEvent } = value;
    if (promotion.captureId !== capture.captureId || golden.captureId !== capture.captureId)
        invalid(["capture"]);
    if (promotion.goldenId !== golden.goldenId || golden.artifact.entityId !== golden.goldenId)
        invalid(["golden"]);
    if (golden.artifact.entityKind !== "golden" || golden.artifact.objectClass !== "private_golden" ||
        golden.artifact.generation !== 1 || golden.artifact.createdByOperationId !== promotion.idempotencyId)
        invalid(["golden", "artifact"]);
    if (value.authorizationDecisionId !== promotion.authorizationDecisionId ||
        auditEvent.captureId !== capture.captureId || auditEvent.goldenId !== null ||
        auditEvent.action !== "capture_promote" || auditEvent.operationId !== promotion.idempotencyId ||
        auditEvent.eventId !== promotion.auditEventId || auditEvent.actorRef !== promotion.actorRef ||
        auditEvent.policyVersion !== 1 || auditEvent.outcomeCode !== "success" ||
        auditEvent.occurredAt !== promotion.occurredAt || !CanonicalIsoTimestamp.safeParse(auditEvent.occurredAt).success)
        invalid(["auditEvent"]);
    const captureRetention = retainedFromPromotion(promotion.occurredAt, 7 * 86_400_000);
    const goldenRetention = retainedFromPromotion(promotion.occurredAt, 365 * 86_400_000);
    if (captureRetention === null || capture.retentionDeadline !== captureRetention)
        invalid(["capture", "retentionDeadline"]);
    if (goldenRetention === null || golden.retentionDeadline !== goldenRetention)
        invalid(["golden", "retentionDeadline"]);
}).readonly();
//# sourceMappingURL=contracts.js.map