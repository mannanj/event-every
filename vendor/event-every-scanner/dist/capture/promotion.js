import { AuditEventSchema, CaptureFailureSchema, CaptureReceiptSchema, PersistedReviewedCapturePromotionResultSchema, PromotionRequestSchema, } from "./contracts.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value, keys) => {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const stable = (value) => {
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")}]`;
    if (!isRecord(value))
        return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
};
const sameBinding = (left, right) => left.snapshotBindingVersion === right.snapshotBindingVersion &&
    left.macKeyVersion === right.macKeyVersion &&
    left.value === right.value;
const isBoundedId = (value) => typeof value === "string" && value.length > 0 && value.length <= 128;
const isOpaqueRef = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const isCanonicalIso = (value) => {
    if (typeof value !== "string" || !CANONICAL_ISO.test(value))
        return false;
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value;
};
const uniqueSourceIds = (value) => {
    if (!Array.isArray(value) || !value.every(isBoundedId))
        return null;
    const sorted = [...value].sort();
    return sorted.every((sourceId, index) => index === 0 || sourceId !== sorted[index - 1])
        ? sorted
        : null;
};
const sameSourceSet = (left, right) => left.length === right.length && left.every((sourceId, index) => sourceId === right[index]);
function expectedEvidenceSourceIds(request) {
    const sourceIds = [];
    const add = (evidence) => {
        for (const reference of evidence)
            sourceIds.push(reference.sourceId);
    };
    for (const candidate of request.expected.candidates) {
        add(candidate.title.evidence);
        add(candidate.description.evidence);
        add(candidate.location.evidence);
        add(candidate.url.evidence);
        add(candidate.temporal.evidence);
        add(candidate.recurrence.evidence);
        for (const issue of candidate.issues)
            add(issue.evidence);
    }
    for (const issue of request.expected.issues)
        add(issue.evidence);
    return sourceIds;
}
function failure(code) {
    return CaptureFailureSchema.parse({
        code,
        retryable: false,
        httpStatus: code === "capture_invalid_input" ? 400 : 409,
    });
}
/** Content-free audit record for a parsed privileged promotion attempt. */
function audit(request, occurredAt, outcomeCode) {
    return AuditEventSchema.parse({
        eventId: request.auditEventId,
        captureId: request.captureId,
        goldenId: null,
        action: "capture_promote",
        occurredAt,
        actorRef: request.actorRef,
        policyVersion: 1,
        operationId: request.idempotencyId,
        outcomeCode,
    });
}
function invalidContext(context) {
    if (!isRecord(context) || !exactKeys(context, [
        "capture", "reviewedSourceIds", "existingPromotion", "reviewedAt", "reviewerRef", "promotionOccurredAt",
    ]))
        return true;
    const capture = CaptureReceiptSchema.safeParse(context.capture);
    const sourceIds = uniqueSourceIds(context.reviewedSourceIds);
    if (!capture.success || sourceIds === null || !isCanonicalIso(context.reviewedAt) ||
        !isOpaqueRef(context.reviewerRef) || !isCanonicalIso(context.promotionOccurredAt))
        return true;
    if (context.existingPromotion === null)
        return false;
    if (!isRecord(context.existingPromotion) || !exactKeys(context.existingPromotion, [
        "idempotencyId", "request", "reviewedSourceIds", "result",
    ]))
        return true;
    const existing = context.existingPromotion;
    const storedRequest = PromotionRequestSchema.safeParse(existing.request);
    const storedResult = PersistedReviewedCapturePromotionResultSchema.safeParse(existing.result);
    if (!isBoundedId(existing.idempotencyId) || !storedRequest.success || !storedResult.success ||
        uniqueSourceIds(existing.reviewedSourceIds) === null ||
        existing.idempotencyId !== storedRequest.data.idempotencyId)
        return true;
    const { promotion, capture: persistedCapture, golden: persistedGolden, auditEvent, authorizationDecisionId } = storedResult.data;
    const request = storedRequest.data;
    return promotion.captureId !== request.captureId || promotion.goldenId !== request.goldenId ||
        promotion.idempotencyId !== request.idempotencyId || promotion.auditEventId !== request.auditEventId ||
        promotion.actorRef !== request.actorRef || promotion.authorizationDecisionId !== request.authorizationDecisionId ||
        persistedCapture.captureId !== request.captureId ||
        persistedCapture.stateVersion !== request.expectedStateVersion + 1 ||
        !Number.isSafeInteger(request.expectedStateVersion + 1) ||
        persistedCapture.generation !== request.expectedGeneration ||
        !isCanonicalIso(persistedCapture.retentionDeadline) ||
        persistedGolden.goldenId !== request.goldenId || persistedGolden.captureId !== request.captureId ||
        stable(persistedGolden.artifact) !== stable(request.createdArtifact) ||
        !isCanonicalIso(persistedGolden.retentionDeadline) ||
        authorizationDecisionId !== request.authorizationDecisionId ||
        auditEvent.captureId !== request.captureId || auditEvent.goldenId !== null ||
        auditEvent.action !== "capture_promote" || auditEvent.outcomeCode !== "success" ||
        auditEvent.actorRef !== request.actorRef || auditEvent.policyVersion !== 1 ||
        auditEvent.operationId !== existing.idempotencyId || auditEvent.eventId !== storedRequest.data.auditEventId ||
        !isCanonicalIso(auditEvent.occurredAt);
}
function invalidResult() {
    return {
        kind: "failure",
        failure: failure("capture_invalid_input"),
        auditEvent: null,
        authorizationDecisionId: null,
        auditPersistence: "host_boundary",
    };
}
function failed(request, promotionOccurredAt, code, outcomeCode = "failed") {
    return {
        kind: "failure",
        failure: failure(code),
        auditEvent: audit(request, promotionOccurredAt, outcomeCode),
        authorizationDecisionId: request.authorizationDecisionId,
        auditPersistence: "before_response",
    };
}
function currentCaptureFailure(request, capture, context) {
    if (capture.state !== "reviewed")
        return "capture_state_conflict";
    if (request.captureId !== capture.captureId ||
        request.reviewedSnapshotHandle !== capture.snapshotHandle ||
        !sameBinding(request.reviewedContentBinding, capture.snapshotBinding) ||
        request.expectedStateVersion !== capture.stateVersion ||
        request.expectedGeneration !== capture.generation ||
        request.provenance.captureId !== capture.captureId ||
        request.provenance.reviewedAt !== context.reviewedAt ||
        request.provenance.reviewerRef !== context.reviewerRef) {
        return "capture_binding_mismatch";
    }
    return null;
}
function validAtomicGoldenArtifact(request) {
    const artifact = request.createdArtifact;
    return artifact.generation === 1 && artifact.entityId === request.goldenId &&
        artifact.createdByOperationId === request.idempotencyId;
}
function isExactReplay(request, reviewedSourceIds, existing) {
    const storedSourceIds = uniqueSourceIds(existing.reviewedSourceIds);
    return storedSourceIds !== null && stable(existing.request) === stable(request) &&
        sameSourceSet(storedSourceIds, reviewedSourceIds);
}
/**
 * Validates a manually authored private-golden request without accepting captured output or raw
 * content.  The host persists the returned audit event with its promotion CAS.
 */
export function validatePromotionRequest(input, context) {
    const parsed = PromotionRequestSchema.safeParse(input);
    if (!parsed.success)
        return invalidResult();
    const request = parsed.data;
    if (invalidContext(context))
        return invalidResult();
    const reviewedSourceIds = uniqueSourceIds(context.reviewedSourceIds);
    if (reviewedSourceIds === null)
        return invalidResult();
    const existing = context.existingPromotion;
    if (existing !== null && existing.idempotencyId !== request.idempotencyId) {
        return failed(request, context.promotionOccurredAt, "capture_idempotency_conflict", "conflict");
    }
    if (existing !== null && existing.result.golden.goldenId !== request.goldenId) {
        return failed(request, context.promotionOccurredAt, "capture_idempotency_conflict", "conflict");
    }
    if (!validAtomicGoldenArtifact(request))
        return failed(request, context.promotionOccurredAt, "capture_binding_mismatch");
    if (existing !== null && !isExactReplay(request, reviewedSourceIds, existing)) {
        return failed(request, context.promotionOccurredAt, "capture_idempotency_conflict", "conflict");
    }
    const capture = context.capture;
    const bindingFailure = currentCaptureFailure(request, capture, context);
    if (bindingFailure !== null) {
        return failed(request, context.promotionOccurredAt, bindingFailure, bindingFailure === "capture_state_conflict" ? "conflict" : "failed");
    }
    const knownSourceIds = new Set(reviewedSourceIds);
    if (expectedEvidenceSourceIds(request).some((sourceId) => !knownSourceIds.has(sourceId))) {
        return failed(request, context.promotionOccurredAt, "capture_binding_mismatch");
    }
    if (existing !== null) {
        return {
            kind: "validated",
            request,
            goldenId: existing.result.golden.goldenId,
            replayed: true,
            auditEvent: existing.result.auditEvent,
            authorizationDecisionId: request.authorizationDecisionId,
            auditPersistence: "already_persisted",
            persistedResult: existing.result,
        };
    }
    return {
        kind: "validated",
        request,
        goldenId: null,
        replayed: false,
        auditEvent: audit(request, context.promotionOccurredAt, "success"),
        authorizationDecisionId: request.authorizationDecisionId,
        auditPersistence: "atomic_with_state_cas",
        persistedResult: null,
    };
}
//# sourceMappingURL=promotion.js.map