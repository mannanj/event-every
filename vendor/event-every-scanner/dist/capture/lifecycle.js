import { AuditEventSchema, CaptureActionSchema, CaptureFailureSchema, CaptureStateSchema, GoldenStateSchema, PromotionRequestSchema, } from "./contracts.js";
import { validatePromotionRequest } from "./promotion.js";
const captureRequestActions = new Set([
    "create_intent", "commit_source", "claim_admission", "record_success", "record_failure",
    "expire_unknown_call", "mark_reviewed", "reject", "request_deletion",
    "finish_deletion", "extend_retention", "re_encrypt", "retire_key", "reconcile",
]);
const goldenRequestActions = new Set(["request_retirement", "finish_retirement"]);
const DAY = 86_400_000;
const MINUTE = 60_000;
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isSafeNonnegative = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isSafePositive = (value) => isSafeNonnegative(value) && value > 0;
const isBoundedId = (value) => typeof value === "string" && value.length > 0 && value.length <= 128;
const isOperationId = (value) => typeof value === "string" && value.length > 0 && value.length <= 96;
const isOpaqueRef = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;
const isCanonicalIso = (value) => {
    if (typeof value !== "string" || !CANONICAL_ISO.test(value))
        return false;
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value;
};
function plus(iso, milliseconds) {
    const base = Date.parse(iso);
    const next = base + milliseconds;
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(next))
        return null;
    const result = new Date(next).toISOString();
    return isCanonicalIso(result) ? result : null;
}
function earlier(left, right) {
    return Date.parse(left) <= Date.parse(right) ? left : right;
}
function increment(value) {
    return value < Number.MAX_SAFE_INTEGER ? value + 1 : null;
}
function failure(code, httpStatus = 409) {
    return CaptureFailureSchema.parse({ code, retryable: false, httpStatus });
}
const auditActions = {
    create_intent: "capture_prepare",
    commit_source: "capture_prepare",
    claim_admission: "capture_claim_admission",
    record_success: "capture_record_success",
    record_failure: "capture_record_failure",
    expire_unknown_call: "capture_reconcile",
    mark_reviewed: "capture_review",
    reject: "capture_reject",
    request_deletion: "capture_delete",
    finish_deletion: "capture_delete",
    extend_retention: "capture_retention_extend",
    re_encrypt: "capture_reencrypt",
    retire_key: "capture_retire_key",
    reconcile: "capture_reconcile",
    request_retirement: "golden_retire",
    finish_retirement: "golden_retire",
    list_summaries: "capture_list",
    decrypt_open: "capture_decrypt",
    delete_derivatives: "capture_delete_derivatives",
};
function audit(action, operationId, auditEventId, actorRef, authorizationDecisionId, now, outcomeCode, captureId, goldenId) {
    const auditAction = auditActions[action];
    if (auditAction === undefined)
        throw new TypeError("closed audit action required");
    const actor = isOpaqueRef(actorRef) ? actorRef : "system";
    if (!isBoundedId(auditEventId))
        throw new TypeError("host audit event identity required");
    return AuditEventSchema.parse({
        eventId: auditEventId,
        captureId,
        goldenId,
        action: auditAction,
        occurredAt: now,
        actorRef: actor,
        policyVersion: 1,
        operationId,
        outcomeCode,
    });
}
function exactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")}]`;
    if (!isRecord(value))
        return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function parseCatalogClaims(value) {
    if (!Array.isArray(value))
        return null;
    const claims = [];
    const seen = new Set();
    for (const candidate of value) {
        if (!validCatalogClaim(candidate))
            return null;
        const key = `${candidate.objectHandle}\u0000${candidate.generation}`;
        if (seen.has(key))
            return null;
        seen.add(key);
        claims.push(candidate);
    }
    return claims;
}
function parseReplayRecords(value, states, isTransitionRequest, captureId, goldenId) {
    if (!Array.isArray(value))
        return null;
    const records = [];
    const seen = new Set();
    for (const candidate of value) {
        if (!isRecord(candidate) || !exactKeys(candidate, [
            "action", "idempotencyId", "request", "state", "stateVersion", "generation", "retentionDeadline",
            "leaseExpiresAt", "auditEvent", "authorizationDecisionId",
        ]) || !isBoundedId(candidate.action) || !isOperationId(candidate.idempotencyId) ||
            !isRecord(candidate.request) || !isTransitionRequest(candidate.request) ||
            candidate.request.action !== candidate.action || candidate.request.idempotencyId !== candidate.idempotencyId ||
            typeof candidate.state !== "string" || !states.includes(candidate.state) ||
            !isSafePositive(candidate.stateVersion) || !isSafePositive(candidate.generation) ||
            !isCanonicalIso(candidate.retentionDeadline) ||
            !(candidate.leaseExpiresAt === null || isCanonicalIso(candidate.leaseExpiresAt)) ||
            !AuditEventSchema.safeParse(candidate.auditEvent).success ||
            candidate.auditEvent.outcomeCode !== "success" ||
            (captureId !== null && candidate.request.captureId !== captureId) ||
            (goldenId !== null && candidate.request.goldenId !== goldenId) ||
            stable(candidate.auditEvent) !== stable(audit(candidate.action, candidate.idempotencyId, candidate.request.auditEventId, candidate.request.actorRef, candidate.request.authorizationDecisionId, candidate.auditEvent.occurredAt, "success", captureId, goldenId)) ||
            !(candidate.authorizationDecisionId === null || isBoundedId(candidate.authorizationDecisionId)) ||
            candidate.authorizationDecisionId !== (isBoundedId(candidate.request.authorizationDecisionId) ? candidate.request.authorizationDecisionId : null) ||
            seen.has(candidate.idempotencyId))
            return null;
        seen.add(candidate.idempotencyId);
        records.push({
            action: candidate.action,
            idempotencyId: candidate.idempotencyId,
            request: candidate.request,
            state: candidate.state,
            stateVersion: candidate.stateVersion,
            generation: candidate.generation,
            retentionDeadline: candidate.retentionDeadline,
            leaseExpiresAt: candidate.leaseExpiresAt,
            auditEvent: candidate.auditEvent,
            authorizationDecisionId: candidate.authorizationDecisionId,
        });
    }
    return records;
}
function parseCaptureCurrent(value) {
    if (!isRecord(value) || !exactKeys(value, [
        "captureId", "state", "stateVersion", "generation", "createdAt", "retentionDeadline",
        "retentionExtensionCount", "leaseExpiresAt", "artifactStatus", "catalogClaims", "idempotencyRecords",
    ]) || !isBoundedId(value.captureId) || !CaptureStateSchema.safeParse(value.state).success ||
        !isSafePositive(value.stateVersion) || !isSafePositive(value.generation) ||
        !isCanonicalIso(value.createdAt) || !isCanonicalIso(value.retentionDeadline) ||
        !isSafeNonnegative(value.retentionExtensionCount) || value.retentionExtensionCount > 1 ||
        !(value.leaseExpiresAt === null || isCanonicalIso(value.leaseExpiresAt)) ||
        !["verified", "corrupt", "missing"].includes(value.artifactStatus))
        return null;
    const catalogClaims = parseCatalogClaims(value.catalogClaims);
    const idempotencyRecords = parseReplayRecords(value.idempotencyRecords, CaptureStateSchema.options, validCaptureRequest, value.captureId, null);
    if (catalogClaims === null || catalogClaims.some((claim) => claim.entityKind !== "capture" || claim.entityId !== value.captureId ||
        !["capture_source", "capture_outcome"].includes(claim.objectClass)) ||
        idempotencyRecords === null || idempotencyRecords.some((record) => record.state !== value.state || record.stateVersion !== value.stateVersion ||
        record.generation !== value.generation || record.retentionDeadline !== value.retentionDeadline ||
        record.leaseExpiresAt !== value.leaseExpiresAt))
        return null;
    return {
        captureId: value.captureId,
        state: value.state,
        stateVersion: value.stateVersion,
        generation: value.generation,
        createdAt: value.createdAt,
        retentionDeadline: value.retentionDeadline,
        retentionExtensionCount: value.retentionExtensionCount,
        leaseExpiresAt: value.leaseExpiresAt,
        artifactStatus: value.artifactStatus,
        catalogClaims,
        idempotencyRecords,
    };
}
function parseGoldenCurrent(value) {
    if (!isRecord(value) || !exactKeys(value, [
        "goldenId", "captureId", "state", "stateVersion", "generation", "retentionDeadline", "leaseExpiresAt", "catalogClaims", "idempotencyRecords",
    ]) || !isBoundedId(value.goldenId) || !isBoundedId(value.captureId) ||
        !GoldenStateSchema.safeParse(value.state).success || !isSafePositive(value.stateVersion) ||
        !isSafePositive(value.generation) || !isCanonicalIso(value.retentionDeadline) ||
        !(value.leaseExpiresAt === null || isCanonicalIso(value.leaseExpiresAt)))
        return null;
    const catalogClaims = parseCatalogClaims(value.catalogClaims);
    const idempotencyRecords = parseReplayRecords(value.idempotencyRecords, GoldenStateSchema.options, validGoldenRequest, null, value.goldenId);
    if (catalogClaims === null || catalogClaims.some((claim) => claim.entityKind !== "golden" || claim.entityId !== value.goldenId ||
        claim.objectClass !== "private_golden") ||
        idempotencyRecords === null || idempotencyRecords.some((record) => record.state !== value.state || record.stateVersion !== value.stateVersion ||
        record.generation !== value.generation || record.retentionDeadline !== value.retentionDeadline ||
        record.leaseExpiresAt !== value.leaseExpiresAt))
        return null;
    return {
        goldenId: value.goldenId,
        captureId: value.captureId,
        state: value.state,
        stateVersion: value.stateVersion,
        generation: value.generation,
        retentionDeadline: value.retentionDeadline,
        leaseExpiresAt: value.leaseExpiresAt,
        catalogClaims,
        idempotencyRecords,
    };
}
function validCatalogClaim(value) {
    return isRecord(value) && exactKeys(value, ["objectHandle", "generation", "objectClass", "entityKind", "entityId"]) &&
        isOpaqueRef(value.objectHandle) && isSafePositive(value.generation) &&
        ((value.entityKind === "capture" && ["capture_source", "capture_outcome"].includes(value.objectClass)) ||
            (value.entityKind === "golden" && value.objectClass === "private_golden")) &&
        isBoundedId(value.entityId);
}
function validCreatedArtifact(value) {
    return isRecord(value) && exactKeys(value, [
        "objectHandle", "generation", "objectClass", "entityKind", "entityId",
        "createdByOperationId", "hostValidatedCleanupClaimId",
    ]) && isOpaqueRef(value.objectHandle) && isSafePositive(value.generation) &&
        ["capture_source", "capture_outcome", "private_golden"].includes(value.objectClass) &&
        ["capture", "golden"].includes(value.entityKind) && isBoundedId(value.entityId) &&
        isOperationId(value.createdByOperationId) && isBoundedId(value.hostValidatedCleanupClaimId);
}
function validRetention(value) {
    return isRecord(value) && exactKeys(value, ["reason", "expiresAt"]) &&
        ["review_extension", "legal_obligation", "security_investigation"].includes(value.reason) &&
        isCanonicalIso(value.expiresAt);
}
function validCaptureRequest(value) {
    if (!isRecord(value) || !isBoundedId(value.captureId) || !isBoundedId(value.action) ||
        !captureRequestActions.has(value.action) ||
        !isOperationId(value.idempotencyId) || !isSafeNonnegative(value.expectedStateVersion) ||
        !isBoundedId(value.auditEventId) ||
        !isSafeNonnegative(value.expectedGeneration) ||
        !(value.expectedState === null || CaptureStateSchema.safeParse(value.expectedState).success))
        return false;
    const base = ["captureId", "action", "expectedState", "expectedStateVersion", "expectedGeneration", "idempotencyId", "auditEventId"];
    const privileged = ["actorRef", "authorizationDecisionId"];
    const confirmed = [...privileged, "confirmationNonce"];
    const keys = ["commit_source", "record_success", "record_failure"].includes(value.action)
        ? [...base, "createdArtifact"]
        : ["expire_unknown_call", "mark_reviewed"].includes(value.action)
            ? [...base, ...privileged]
            : value.action === "reconcile"
                ? [...base, ...privileged, ...(value.reconciliation === undefined ? [] : ["reconciliation"])]
                : value.action === "re_encrypt"
                    ? [...base, ...confirmed, "createdArtifact"]
                    : ["reject", "request_deletion", "retire_key"].includes(value.action)
                        ? [...base, ...confirmed]
                        : value.action === "finish_deletion"
                            ? [...base, ...privileged, "objectAbsence", ...(value.objectAbsenceClaims === undefined ? [] : ["objectAbsenceClaims"])]
                            : value.action === "extend_retention"
                                ? [...base, ...confirmed, "retention"]
                                : base;
    if (!exactKeys(value, keys))
        return false;
    if (keys.includes("actorRef") && (!isOpaqueRef(value.actorRef) || !isBoundedId(value.authorizationDecisionId)))
        return false;
    if (keys.includes("confirmationNonce") && !isBoundedId(value.confirmationNonce))
        return false;
    if (keys.includes("createdArtifact") && value.createdArtifact !== null && !validCreatedArtifact(value.createdArtifact))
        return false;
    if (["commit_source", "record_success", "record_failure"].includes(value.action) &&
        value.createdArtifact === null)
        return false;
    if (keys.includes("objectAbsence") && !isBoundedId(value.objectAbsence))
        return false;
    if (keys.includes("objectAbsenceClaims") && parseCatalogClaims(value.objectAbsenceClaims) === null)
        return false;
    if (keys.includes("reconciliation") && value.reconciliation !== "expired_or_inconsistent")
        return false;
    return !keys.includes("retention") || validRetention(value.retention);
}
function validGoldenRequest(value) {
    if (!isRecord(value) || !isBoundedId(value.goldenId) || !isBoundedId(value.action) ||
        !goldenRequestActions.has(value.action) ||
        !isOperationId(value.idempotencyId) || !isBoundedId(value.actorRef) ||
        !isBoundedId(value.authorizationDecisionId) || !isBoundedId(value.confirmationNonce) ||
        !isBoundedId(value.auditEventId) ||
        !isSafeNonnegative(value.expectedStateVersion) || !isSafeNonnegative(value.expectedGeneration))
        return false;
    const base = ["goldenId", "action", "expectedState", "expectedStateVersion", "expectedGeneration", "actorRef", "authorizationDecisionId", "idempotencyId", "auditEventId", "confirmationNonce"];
    const keys = value.action === "request_retirement"
        ? [...base, ...(value.createdArtifact === undefined ? [] : ["createdArtifact"])]
        : value.action === "finish_retirement"
            ? [...base, "objectAbsence", ...(value.objectAbsenceClaims === undefined ? [] : ["objectAbsenceClaims"])]
            : base;
    return exactKeys(value, keys) &&
        (value.action === "request_retirement" && value.expectedState === "active" ||
            (value.action === "finish_retirement" && value.expectedState === "retirement_pending")) &&
        (value.action !== "finish_retirement" || (isBoundedId(value.objectAbsence) &&
            (value.objectAbsenceClaims === undefined || parseCatalogClaims(value.objectAbsenceClaims) !== null))) &&
        (value.action === "finish_retirement" || value.createdArtifact === undefined || value.createdArtifact === null || validCreatedArtifact(value.createdArtifact));
}
function isCatalogBound(current, artifact) {
    return artifact !== null && current !== null && current.catalogClaims.some((claim) => claim.objectHandle === artifact.objectHandle && claim.generation === artifact.generation);
}
function sameClaims(left, right) {
    if (left.length !== right.length)
        return false;
    return left.every((claim) => right.some((candidate) => candidate.objectHandle === claim.objectHandle && candidate.generation === claim.generation &&
        candidate.objectClass === claim.objectClass && candidate.entityKind === claim.entityKind &&
        candidate.entityId === claim.entityId));
}
function expectedCreatedGeneration(action, baseGeneration) {
    if (action === "commit_source")
        return baseGeneration;
    if (["record_success", "record_failure", "re_encrypt", "request_retirement"].includes(action)) {
        return increment(baseGeneration);
    }
    return null;
}
function validCreatedArtifactForCapture(action, current, request, baseGeneration) {
    const artifact = request.createdArtifact;
    const expectedGeneration = expectedCreatedGeneration(action, baseGeneration);
    if (expectedGeneration === null)
        return true;
    if (action === "re_encrypt" && artifact === null)
        return true;
    const expectedClass = action === "commit_source"
        ? "capture_source"
        : ["record_success", "record_failure"].includes(action)
            ? "capture_outcome"
            : action === "re_encrypt"
                ? ["capture_source", "capture_outcome"]
                : null;
    if (!validCreatedArtifact(artifact) || current === null || expectedClass === null ||
        artifact.createdByOperationId !== request.idempotencyId || artifact.entityKind !== "capture" ||
        artifact.entityId !== request.captureId ||
        (Array.isArray(expectedClass) ? !expectedClass.includes(artifact.objectClass) : artifact.objectClass !== expectedClass))
        return false;
    return artifact.generation === expectedGeneration && !isCatalogBound(current, artifact);
}
function validCreatedArtifactForGolden(action, current, request, baseGeneration) {
    const artifact = request.createdArtifact;
    if (action === "finish_retirement")
        return true;
    if (action === "request_retirement" && (request.createdArtifact === undefined || request.createdArtifact === null))
        return true;
    const expectedGeneration = expectedCreatedGeneration(action, baseGeneration);
    if (!validCreatedArtifact(artifact) || expectedGeneration === null ||
        artifact.createdByOperationId !== request.idempotencyId || artifact.entityKind !== "golden" ||
        artifact.entityId !== request.goldenId || artifact.objectClass !== "private_golden")
        return false;
    return artifact.generation === expectedGeneration && !isCatalogBound(current, artifact);
}
function cleanup(current, request) {
    const artifact = request.createdArtifact;
    const action = request.action;
    if (!validCreatedArtifactForCapture(action, current, request, request.expectedGeneration) ||
        !validCreatedArtifact(artifact) || artifact.createdByOperationId !== request.idempotencyId)
        return null;
    return {
        kind: "claim_and_delete_host_validated_loser_artifact",
        hostValidatedCleanupClaimId: artifact.hostValidatedCleanupClaimId,
    };
}
function goldenCleanup(current, request) {
    const artifact = request.createdArtifact;
    const action = request.action;
    if (!validCreatedArtifact(artifact) ||
        !validCreatedArtifactForGolden(action, current, request, request.expectedGeneration))
        return null;
    if (action === "request_retirement" && request.expectedState !== "active")
        return null;
    const expectedGeneration = action === "request_retirement"
        ? increment(request.expectedGeneration)
        : null;
    // A stale writer may clean up only an object it created. An artifact already named by the
    // authoritative golden row is never a loser artifact, even when its generation coincides.
    if (expectedGeneration === null || artifact.generation !== expectedGeneration ||
        (current !== null && isCatalogBound(current, artifact)))
        return null;
    return {
        kind: "claim_and_delete_host_validated_loser_artifact",
        hostValidatedCleanupClaimId: artifact.hostValidatedCleanupClaimId,
    };
}
function captureFailure(code, request, current, now, outcomeCode, includeCleanup = false) {
    if (request === null)
        return {
            ok: false,
            failure: failure(code, code === "capture_invalid_input" ? 400 : 409),
            auditEvent: null,
            authorizationDecisionId: null,
            auditPersistence: "host_boundary",
            cleanupObligation: null,
        };
    const action = typeof request?.action === "string" ? request.action : "reconcile";
    const operationId = isOperationId(request?.idempotencyId) ? request.idempotencyId : "invalid-request";
    return {
        ok: false,
        failure: failure(code, code === "capture_unauthorized" ? 403 : code === "capture_invalid_input" ? 400 : 409),
        auditEvent: audit(action, operationId, request?.auditEventId, request?.actorRef, request?.authorizationDecisionId, now, outcomeCode, current?.captureId ?? request?.captureId, null),
        authorizationDecisionId: isBoundedId(request?.authorizationDecisionId) ? request.authorizationDecisionId : null,
        auditPersistence: "before_response",
        cleanupObligation: includeCleanup && request !== null ? cleanup(current, request) : null,
    };
}
function goldenFailure(code, request, current, now, outcomeCode) {
    if (request === null)
        return {
            ok: false,
            failure: failure(code, code === "capture_invalid_input" ? 400 : 409),
            auditEvent: null,
            authorizationDecisionId: null,
            auditPersistence: "host_boundary",
            cleanupObligation: null,
        };
    const action = typeof request?.action === "string" ? request.action : "request_retirement";
    const operationId = isOperationId(request?.idempotencyId) ? request.idempotencyId : "invalid-request";
    return {
        ok: false,
        failure: failure(code, code === "capture_invalid_input" ? 400 : 409),
        auditEvent: audit(action, operationId, request?.auditEventId, request?.actorRef, request?.authorizationDecisionId, now, outcomeCode, null, current?.goldenId ?? request?.goldenId),
        authorizationDecisionId: isBoundedId(request?.authorizationDecisionId) ? request.authorizationDecisionId : null,
        auditPersistence: "before_response",
        cleanupObligation: request === null ? null : goldenCleanup(current, request),
    };
}
function promotionCleanup(request, persistedPromotion, golden) {
    const artifact = request.createdArtifact;
    if (artifact.objectClass !== "private_golden" || artifact.entityKind !== "golden" ||
        artifact.generation !== 1 || artifact.entityId !== request.goldenId ||
        artifact.createdByOperationId !== request.idempotencyId ||
        (persistedPromotion !== null &&
            persistedPromotion.golden.artifact.objectHandle === artifact.objectHandle &&
            persistedPromotion.golden.artifact.generation === artifact.generation) ||
        (golden !== null && isCatalogBound(golden, artifact)))
        return null;
    return {
        kind: "claim_and_delete_host_validated_loser_artifact",
        hostValidatedCleanupClaimId: artifact.hostValidatedCleanupClaimId,
    };
}
function promotionFailure(code, request, context, outcomeCode, cleanupObligation) {
    return {
        kind: "failure",
        failure: failure(code, code === "capture_corrupt" ? 409 : 409),
        auditEvent: AuditEventSchema.parse({
            eventId: request.auditEventId,
            captureId: request.captureId,
            goldenId: null,
            action: "capture_promote",
            occurredAt: context.promotionOccurredAt,
            actorRef: request.actorRef,
            policyVersion: 1,
            operationId: request.idempotencyId,
            outcomeCode,
        }),
        authorizationDecisionId: request.authorizationDecisionId,
        auditPersistence: "before_response",
        cleanupObligation,
    };
}
const captureTransitions = {
    create_intent: [null],
    commit_source: ["preparing"],
    claim_admission: ["prepared"],
    record_success: ["provider_inflight"],
    record_failure: ["provider_inflight"],
    expire_unknown_call: ["provider_inflight"],
    mark_reviewed: ["completed", "scan_failed", "scan_outcome_unknown"],
    reject: ["prepared", "completed", "scan_failed", "scan_outcome_unknown", "reviewed"],
    request_deletion: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected"],
    finish_deletion: ["deletion_pending"],
    extend_retention: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"],
    re_encrypt: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected"],
    retire_key: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected"],
    reconcile: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"],
};
const nextCaptureState = {
    create_intent: "preparing",
    commit_source: "prepared",
    claim_admission: "provider_inflight",
    record_success: "completed",
    record_failure: "scan_failed",
    expire_unknown_call: "scan_outcome_unknown",
    mark_reviewed: "reviewed",
    reject: "rejected",
    request_deletion: "deletion_pending",
    finish_deletion: "deleted",
};
function expiredPreparing(current, now) {
    return current?.state === "preparing" && current.leaseExpiresAt !== null &&
        Date.parse(now) >= Date.parse(current.leaseExpiresAt);
}
function calculateRetentionDeadline(action, current, request, now) {
    switch (action) {
        case "create_intent": return plus(now, DAY);
        case "commit_source":
        case "record_failure":
        case "expire_unknown_call": return plus(now, 7 * DAY);
        case "claim_admission": return plus(now, 15 * MINUTE);
        case "record_success": return plus(now, 30 * DAY);
        case "mark_reviewed": {
            if (current === null)
                return null;
            const fromReview = plus(now, 30 * DAY);
            const cap = plus(current.createdAt, 60 * DAY);
            return fromReview === null || cap === null ? null : earlier(fromReview, cap);
        }
        case "reject": return plus(now, DAY);
        case "request_deletion": return now;
        case "reconcile": return expiredPreparing(current, now) ? now : current?.retentionDeadline ?? null;
        case "finish_deletion": return plus(now, 365 * DAY);
        case "extend_retention": {
            if (current === null || current.retentionExtensionCount !== 0 || !isRecord(request.retention) || !isCanonicalIso(request.retention.expiresAt))
                return null;
            const expiresAt = request.retention.expiresAt;
            const maximum = plus(current.createdAt, 90 * DAY);
            const perExtension = plus(current.retentionDeadline, 30 * DAY);
            if (maximum === null || perExtension === null || Date.parse(expiresAt) <= Date.parse(current.retentionDeadline) ||
                Date.parse(expiresAt) > Date.parse(maximum) || Date.parse(expiresAt) > Date.parse(perExtension))
                return null;
            return expiresAt;
        }
        default: return current?.retentionDeadline ?? null;
    }
}
function nextGeneration(action, current, request) {
    const currentGeneration = current?.generation ?? 0;
    const createsObjectGeneration = action === "create_intent" || action === "request_deletion" ||
        ["record_success", "record_failure", "re_encrypt"].includes(action) && request.createdArtifact !== null;
    return createsObjectGeneration ? increment(currentGeneration) : currentGeneration;
}
function leaseExpiry(action, now, current) {
    if (action === "create_intent")
        return plus(now, DAY);
    if (action === "claim_admission")
        return plus(now, 15 * MINUTE);
    if (action === "reconcile")
        return expiredPreparing(current, now) ? null : current?.leaseExpiresAt ?? null;
    if (["extend_retention", "re_encrypt", "retire_key"].includes(action))
        return current?.leaseExpiresAt ?? null;
    return null;
}
/**
 * Pure lifecycle policy. The returned audit event is part of the CAS result: hosts must persist it
 * in the same transaction as a successful state change. This function never performs persistence,
 * cleanup, or clock access.
 */
export function applyCaptureTransition(currentInput, requestInput, now) {
    const auditNow = isCanonicalIso(now) ? now : "1970-01-01T00:00:00.000Z";
    if (!isCanonicalIso(now) || !validCaptureRequest(requestInput)) {
        return captureFailure("capture_invalid_input", null, null, auditNow, "failed");
    }
    const current = currentInput === null ? null : parseCaptureCurrent(currentInput);
    const request = requestInput;
    const action = request.action;
    const idempotencyId = request.idempotencyId;
    if (currentInput !== null && current === null)
        return captureFailure("capture_invalid_input", request, null, now, "failed");
    if (!CaptureActionSchema.safeParse(action).success || captureTransitions[action] === undefined) {
        return captureFailure("capture_invalid_input", request, current, now, "failed");
    }
    if ((current === null && action !== "create_intent") || (current !== null && request.captureId !== current.captureId)) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict");
    }
    const replay = current?.idempotencyRecords.find((entry) => entry.idempotencyId === idempotencyId);
    if (replay !== undefined && current !== null) {
        if (replay.action !== action || stable(replay.request) !== stable(request)) {
            return captureFailure("capture_idempotency_conflict", request, current, now, "conflict");
        }
        return {
            ok: true,
            state: replay.state,
            stateVersion: replay.stateVersion,
            generation: replay.generation,
            retentionDeadline: replay.retentionDeadline,
            leaseExpiresAt: replay.leaseExpiresAt,
            auditEvent: replay.auditEvent,
            authorizationDecisionId: replay.authorizationDecisionId,
            auditPersistence: "already_persisted",
            replayed: true,
        };
    }
    if (current === null && (request.expectedState !== null || request.expectedStateVersion !== 0 || request.expectedGeneration !== 0)) {
        return captureFailure("capture_state_conflict", request, null, now, "conflict");
    }
    if (current !== null && request.expectedGeneration !== current.generation) {
        return captureFailure("capture_generation_conflict", request, current, now, "conflict", true);
    }
    if (current !== null && (request.expectedStateVersion !== current.stateVersion || request.expectedState !== current.state || current.state === "deleted")) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict", true);
    }
    if (!captureTransitions[action]?.includes(current?.state ?? null)) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict", true);
    }
    if (current !== null && current.artifactStatus !== "verified" && !["request_deletion", "finish_deletion", "reconcile"].includes(action)) {
        return captureFailure("capture_corrupt", request, current, now, "failed", true);
    }
    if (action === "commit_source" && (current?.leaseExpiresAt === null || current?.leaseExpiresAt === undefined || Date.parse(now) >= Date.parse(current.leaseExpiresAt))) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict");
    }
    if (action === "expire_unknown_call" && (current?.leaseExpiresAt === null || current?.leaseExpiresAt === undefined || Date.parse(now) < Date.parse(current.leaseExpiresAt))) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict");
    }
    if (action === "finish_deletion" && (request.objectAbsence !== "all_catalog_named_objects_absent" ||
        !sameClaims(current?.catalogClaims ?? [], request.objectAbsenceClaims === undefined ? [] : parseCatalogClaims(request.objectAbsenceClaims) ?? []))) {
        return captureFailure("capture_delete_incomplete", request, current, now, "failed");
    }
    if (!validCreatedArtifactForCapture(action, current, request, current?.generation ?? 0)) {
        return captureFailure("capture_generation_conflict", request, current, now, "conflict", true);
    }
    if (action === "reconcile" && request.reconciliation !== "expired_or_inconsistent" &&
        current?.artifactStatus === "verified" &&
        !(current?.state === "preparing" && current.leaseExpiresAt !== null && Date.parse(now) >= Date.parse(current.leaseExpiresAt)) &&
        !(current?.state === "provider_inflight" && current.leaseExpiresAt !== null && Date.parse(now) >= Date.parse(current.leaseExpiresAt))) {
        return captureFailure("capture_state_conflict", request, current, now, "conflict");
    }
    const state = action === "reconcile" && expiredPreparing(current, now)
        ? "deletion_pending"
        : nextCaptureState[action] ?? current?.state;
    const retentionDeadline = calculateRetentionDeadline(action, current, request, now);
    const stateVersion = increment(current?.stateVersion ?? 0);
    const generation = action === "reconcile" && expiredPreparing(current, now)
        ? increment(current?.generation ?? 0)
        : nextGeneration(action, current, request);
    const leaseExpiresAt = leaseExpiry(action, now, current);
    if (state === undefined || retentionDeadline === null || stateVersion === null || generation === null) {
        return captureFailure(action === "extend_retention" && retentionDeadline === null
            ? "capture_confirmation_invalid"
            : "capture_state_conflict", request, current, now, action === "extend_retention" && retentionDeadline === null ? "failed" : "conflict", true);
    }
    return {
        ok: true,
        state,
        stateVersion,
        generation,
        retentionDeadline,
        leaseExpiresAt,
        auditEvent: audit(action, idempotencyId, request.auditEventId, request.actorRef, request.authorizationDecisionId, now, "success", current?.captureId ?? request.captureId, null),
        authorizationDecisionId: isBoundedId(request.authorizationDecisionId) ? request.authorizationDecisionId : null,
        auditPersistence: "atomic_with_state_cas",
        replayed: false,
    };
}
/** Pure golden lifecycle policy; hosts persist the returned audit event atomically with their CAS. */
export function applyGoldenTransition(currentInput, requestInput, now) {
    const auditNow = isCanonicalIso(now) ? now : "1970-01-01T00:00:00.000Z";
    if (!isCanonicalIso(now) || !validGoldenRequest(requestInput)) {
        return goldenFailure("capture_invalid_input", null, null, auditNow, "failed");
    }
    const current = currentInput === null ? null : parseGoldenCurrent(currentInput);
    const request = requestInput;
    const action = request.action;
    const idempotencyId = request.idempotencyId;
    if (currentInput !== null && current === null)
        return goldenFailure("capture_invalid_input", request, null, now, "failed");
    if (current !== null && request.goldenId !== current.goldenId)
        return goldenFailure("capture_state_conflict", request, current, now, "conflict");
    const replay = current?.idempotencyRecords.find((entry) => entry.idempotencyId === idempotencyId);
    if (replay !== undefined && current !== null) {
        if (replay.action !== action || stable(replay.request) !== stable(request)) {
            return goldenFailure("capture_idempotency_conflict", request, current, now, "conflict");
        }
        return {
            ok: true,
            state: replay.state,
            stateVersion: replay.stateVersion,
            generation: replay.generation,
            retentionDeadline: replay.retentionDeadline,
            leaseExpiresAt: replay.leaseExpiresAt,
            auditEvent: replay.auditEvent,
            authorizationDecisionId: replay.authorizationDecisionId,
            auditPersistence: "already_persisted",
            replayed: true,
        };
    }
    if (current !== null && request.expectedGeneration !== current.generation) {
        return goldenFailure("capture_generation_conflict", request, current, now, "conflict");
    }
    if (current !== null && (request.expectedStateVersion !== current.stateVersion || current.state === "retired")) {
        return goldenFailure("capture_state_conflict", request, current, now, "conflict");
    }
    const allowed = (action === "request_retirement" && current?.state === "active" && request.expectedState === "active") ||
        (action === "finish_retirement" && current?.state === "retirement_pending" && request.expectedState === "retirement_pending");
    if (!allowed) {
        return goldenFailure("capture_state_conflict", request, current, now, "conflict");
    }
    const state = action === "request_retirement" ? "retirement_pending" : "retired";
    if (action === "finish_retirement" && (request.objectAbsence !== "all_catalog_named_objects_absent" ||
        !sameClaims(current?.catalogClaims ?? [], request.objectAbsenceClaims === undefined ? [] : parseCatalogClaims(request.objectAbsenceClaims) ?? []))) {
        return goldenFailure("capture_delete_incomplete", request, current, now, "failed");
    }
    if (!validCreatedArtifactForGolden(action, current, request, current?.generation ?? 0)) {
        return goldenFailure("capture_generation_conflict", request, current, now, "conflict");
    }
    const stateVersion = increment(current?.stateVersion ?? 0);
    const generation = action === "request_retirement"
        ? increment(current?.generation ?? 0)
        : current?.generation;
    const retentionDeadline = state === "retired" ? plus(now, 365 * DAY) : current?.retentionDeadline ?? plus(now, 365 * DAY);
    if (stateVersion === null || generation === null || generation === undefined || retentionDeadline === null) {
        return goldenFailure("capture_state_conflict", request, current, now, "conflict");
    }
    return {
        ok: true,
        state,
        stateVersion,
        generation,
        retentionDeadline,
        leaseExpiresAt: null,
        auditEvent: audit(action, idempotencyId, request.auditEventId, request.actorRef, request.authorizationDecisionId, now, "success", null, current?.goldenId ?? request.goldenId),
        authorizationDecisionId: request.authorizationDecisionId,
        auditPersistence: "atomic_with_state_cas",
        replayed: false,
    };
}
/**
 * Computes the one auditable reviewed-capture → active-golden promotion.  The returned result is
 * intentionally paired: a host cannot use it to create a golden without also advancing the
 * reviewed capture, and the golden ciphertext is owned only by the golden lifecycle.
 */
export function applyReviewedCapturePromotion(captureInput, goldenInput, requestInput, context) {
    const validated = validatePromotionRequest(requestInput, context);
    const parsedRequest = PromotionRequestSchema.safeParse(requestInput);
    const golden = goldenInput === null ? null : parseGoldenCurrent(goldenInput);
    // A failure with an audit has passed the strict context validation above, so its persisted
    // result is authoritative. A malformed current golden cannot prove the new object is owned.
    const persistedPromotion = validated.kind === "failure" && validated.auditEvent !== null
        ? context.existingPromotion?.result ?? null
        : null;
    const cleanupObligation = parsedRequest.success
        ? promotionCleanup(parsedRequest.data, persistedPromotion, golden)
        : null;
    if (validated.kind === "failure") {
        return {
            ...validated,
            cleanupObligation: validated.auditEvent === null ? null : cleanupObligation,
        };
    }
    if (validated.replayed) {
        return {
            kind: "promoted",
            ...validated.persistedResult,
            auditPersistence: "already_persisted",
            replayed: true,
        };
    }
    const capture = parseCaptureCurrent(captureInput);
    if (capture === null || goldenInput !== null || golden !== null || capture.state !== "reviewed" ||
        capture.captureId !== validated.request.captureId ||
        capture.stateVersion !== validated.request.expectedStateVersion ||
        capture.generation !== validated.request.expectedGeneration ||
        capture.catalogClaims.some((claim) => claim.objectClass === "private_golden")) {
        return promotionFailure("capture_state_conflict", validated.request, context, "conflict", cleanupObligation);
    }
    if (capture.artifactStatus !== "verified") {
        return promotionFailure("capture_corrupt", validated.request, context, "failed", cleanupObligation);
    }
    const stateVersion = increment(capture.stateVersion);
    const retentionDeadline = plus(context.promotionOccurredAt, 7 * DAY);
    const goldenRetentionDeadline = plus(context.promotionOccurredAt, 365 * DAY);
    if (stateVersion === null || retentionDeadline === null || goldenRetentionDeadline === null) {
        return promotionFailure("capture_state_conflict", validated.request, context, "conflict", cleanupObligation);
    }
    return {
        kind: "promoted",
        promotion: {
            captureId: capture.captureId,
            goldenId: validated.request.goldenId,
            idempotencyId: validated.request.idempotencyId,
            auditEventId: validated.request.auditEventId,
            actorRef: validated.request.actorRef,
            authorizationDecisionId: validated.authorizationDecisionId,
            occurredAt: context.promotionOccurredAt,
        },
        capture: {
            captureId: capture.captureId,
            state: "promoted",
            stateVersion,
            generation: capture.generation,
            retentionDeadline,
        },
        golden: {
            goldenId: validated.request.goldenId,
            captureId: capture.captureId,
            state: "active",
            stateVersion: 1,
            generation: 1,
            artifact: validated.request.createdArtifact,
            retentionDeadline: goldenRetentionDeadline,
        },
        auditEvent: validated.auditEvent,
        authorizationDecisionId: validated.authorizationDecisionId,
        auditPersistence: "atomic_with_capture_and_golden_cas",
        replayed: false,
    };
}
const permissions = {
    list_summaries: { capability: "capture.review", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"] },
    decrypt_open: { capability: "capture.review", states: ["prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted"] },
    mark_reviewed: { capability: "capture.review", states: ["completed", "scan_failed", "scan_outcome_unknown"] },
    reject: { capability: "capture.review", states: ["prepared", "completed", "scan_failed", "scan_outcome_unknown", "reviewed"] },
    extend_retention: { capability: "capture.retain", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"] },
    request_deletion: { capability: "capture.delete", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"] },
    finish_deletion: { capability: "capture.delete", states: ["deletion_pending"] },
    delete_derivatives: { capability: "capture.delete_derivatives", states: ["promoted", "deletion_pending", "deleted"] },
    re_encrypt: { capability: "capture.key_admin", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected"] },
    retire_key: { capability: "capture.key_admin", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected"] },
    expire_unknown_call: { capability: "capture.reconcile", states: ["provider_inflight"] },
    reconcile: { capability: "capture.reconcile", states: ["preparing", "prepared", "provider_inflight", "completed", "scan_failed", "scan_outcome_unknown", "reviewed", "promoted", "rejected", "deletion_pending"] },
};
const goldenPermissions = {
    request_retirement: { capability: "capture.delete_derivatives", states: ["active"] },
    finish_retirement: { capability: "capture.delete_derivatives", states: ["retirement_pending"] },
};
/**
 * Returns the required audit event for a privileged action. Hosts must append it before returning
 * private data for list/decrypt, and must append it atomically with every state-changing CAS.
 */
export function authorizeCaptureAction(input) {
    const common = ["action", "state", "capability", "actorRef", "authorizationDecisionId", "operationId", "auditEventId", "now", "artifactStatus"];
    const captureInput = isRecord(input) && exactKeys(input, ["captureId", ...common]) &&
        isBoundedId(input.captureId) && CaptureStateSchema.safeParse(input.state).success;
    const goldenInput = isRecord(input) && exactKeys(input, ["goldenId", ...common]) &&
        isBoundedId(input.goldenId) && (input.state === "absent" || GoldenStateSchema.safeParse(input.state).success);
    if ((!captureInput && !goldenInput) || !isRecord(input) || !isBoundedId(input.capability) || !isOpaqueRef(input.actorRef) ||
        !isBoundedId(input.authorizationDecisionId) || !isOperationId(input.operationId) || !isBoundedId(input.auditEventId) || !isCanonicalIso(input.now) ||
        !["verified", "corrupt", "missing"].includes(input.artifactStatus)) {
        return {
            authorized: false,
            failure: failure("capture_invalid_input", 400),
            authorizationDecisionId: null,
            auditEvent: null,
            auditPersistence: "host_boundary",
        };
    }
    const action = input.action;
    if (!CaptureActionSchema.safeParse(action).success ||
        (captureInput && permissions[action] === undefined) ||
        (goldenInput && goldenPermissions[action] === undefined)) {
        return {
            authorized: false,
            failure: failure("capture_invalid_input", 400),
            authorizationDecisionId: null,
            auditEvent: null,
            auditPersistence: "host_boundary",
        };
    }
    const artifactStatus = input.artifactStatus;
    const golden = goldenInput;
    const rule = golden ? goldenPermissions[action] : permissions[action];
    const state = input.state;
    const corruptBlocked = !golden && artifactStatus !== "verified" && !["request_deletion", "finish_deletion", "reconcile"].includes(action);
    if (rule === undefined || input.capability !== rule.capability || !rule.states.includes(state) || corruptBlocked) {
        return {
            authorized: false,
            failure: failure(corruptBlocked ? "capture_corrupt" : "capture_unauthorized", corruptBlocked ? 409 : 403),
            authorizationDecisionId: input.authorizationDecisionId,
            auditEvent: audit(action, input.operationId, input.auditEventId, input.actorRef, input.authorizationDecisionId, input.now, "denied", captureInput ? input.captureId : null, goldenInput ? input.goldenId : null),
            auditPersistence: "before_response",
        };
    }
    return {
        authorized: true,
        authorizationDecisionId: input.authorizationDecisionId,
        auditEvent: audit(action, input.operationId, input.auditEventId, input.actorRef, input.authorizationDecisionId, input.now, "success", captureInput ? input.captureId : null, goldenInput ? input.goldenId : null),
        auditPersistence: action === "list_summaries" || action === "decrypt_open" ? "before_private_data" : "atomic_with_state_cas",
    };
}
//# sourceMappingURL=lifecycle.js.map