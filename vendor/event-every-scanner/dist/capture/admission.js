import { ProviderScanObservationSchema } from "../contracts.js";
import { CaptureEligibilityInputSchema, CaptureFailureSchema, CaptureReceiptSchema, SnapshotBindingSchema, } from "./contracts.js";
import { evaluateCaptureEligibility } from "./eligibility.js";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value, keys) => {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
function failure(code, httpStatus) {
    return CaptureFailureSchema.parse({ code, retryable: false, httpStatus });
}
function invalid() {
    return { kind: "invalid", failure: failure("capture_invalid_input", 400) };
}
function parseInput(input) {
    if (!isRecord(input) || !exactKeys(input, [
        "eligibility", "subjectRef", "snapshotHandle", "snapshotBinding", "routeKind",
        "schemaVersion", "generation", "operationId",
    ]))
        return null;
    const eligibility = CaptureEligibilityInputSchema.safeParse(input.eligibility);
    const binding = SnapshotBindingSchema.safeParse(input.snapshotBinding);
    if (!eligibility.success || !binding.success)
        return null;
    if (typeof input.subjectRef !== "string" || input.subjectRef.length < 1 || input.subjectRef.length > 256 ||
        typeof input.snapshotHandle !== "string" || input.snapshotHandle.length < 1 || input.snapshotHandle.length > 256 ||
        (input.routeKind !== "text_link" && input.routeKind !== "vision") ||
        typeof input.schemaVersion !== "number" || !Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1 ||
        typeof input.generation !== "number" || !Number.isSafeInteger(input.generation) || input.generation < 1 ||
        typeof input.operationId !== "string" || input.operationId.length < 1 || input.operationId.length > 128)
        return null;
    return {
        eligibility: eligibility.data,
        subjectRef: input.subjectRef,
        snapshotHandle: input.snapshotHandle,
        snapshotBinding: binding.data,
        routeKind: input.routeKind,
        schemaVersion: input.schemaVersion,
        generation: input.generation,
        operationId: input.operationId,
    };
}
function matchingReceipt(input, receipt, captureId) {
    return ((captureId === undefined || receipt.captureId === captureId) &&
        receipt.subjectRef === input.subjectRef &&
        receipt.snapshotHandle === input.snapshotHandle &&
        receipt.snapshotBinding.snapshotBindingVersion === input.snapshotBinding.snapshotBindingVersion &&
        receipt.snapshotBinding.macKeyVersion === input.snapshotBinding.macKeyVersion &&
        receipt.snapshotBinding.value === input.snapshotBinding.value &&
        receipt.routeKind === input.routeKind &&
        receipt.schemaVersion === input.schemaVersion &&
        receipt.generation === input.generation &&
        receipt.operationId === input.operationId);
}
function parsePrepareResult(value) {
    if (!isRecord(value) || !exactKeys(value, ["kind", "receipt"]))
        return null;
    if (value.kind !== "prepared" && value.kind !== "existing")
        return null;
    const receipt = CaptureReceiptSchema.safeParse(value.receipt);
    return receipt.success ? { kind: value.kind, receipt: receipt.data } : null;
}
function parseClaimResult(value) {
    if (!isRecord(value) || !exactKeys(value, ["kind", "receipt"]))
        return null;
    if (value.kind !== "claimed" && value.kind !== "existing")
        return null;
    const receipt = CaptureReceiptSchema.safeParse(value.receipt);
    if (!receipt.success)
        return null;
    if (value.kind === "claimed") {
        if (receipt.data.state !== "provider_inflight" || receipt.data.executionId === null)
            return null;
        return { kind: "claimed", receipt: { ...receipt.data, state: "provider_inflight", executionId: receipt.data.executionId } };
    }
    return { kind: "existing", receipt: receipt.data };
}
function parseProviderResult(value) {
    if (!isRecord(value))
        return null;
    if (value.kind === "success") {
        if (!exactKeys(value, ["kind", "observation"]))
            return null;
        const observation = ProviderScanObservationSchema.safeParse(value.observation);
        return observation.success ? { kind: "success", observation: observation.data } : null;
    }
    if (value.kind === "failure") {
        if (!exactKeys(value, ["kind", "failure"]))
            return null;
        const parsedFailure = CaptureFailureSchema.safeParse(value.failure);
        if (!parsedFailure.success || parsedFailure.data.code !== "capture_provider_failed")
            return null;
        return {
            kind: "failure",
            failure: {
                code: "capture_provider_failed",
                retryable: parsedFailure.data.retryable,
                httpStatus: parsedFailure.data.httpStatus,
            },
        };
    }
    return null;
}
function nextStateVersion(value) {
    return Number.isSafeInteger(value) && value < Number.MAX_SAFE_INTEGER ? value + 1 : null;
}
/**
 * Admits at most one provider call for a durably prepared, immutable capture receipt.
 * Host ports own storage, time, transport, and all source content resolution.
 */
export async function runCapturedAdmission(input, ports) {
    const parsed = parseInput(input);
    if (parsed === null)
        return invalid();
    const eligibility = evaluateCaptureEligibility(parsed.eligibility);
    if (eligibility.kind === "invalid")
        return eligibility;
    if (eligibility.kind === "not_eligible")
        return eligibility;
    let prepared;
    try {
        const result = await ports.capture.prepare({
            subjectRef: parsed.subjectRef,
            snapshotHandle: parsed.snapshotHandle,
            snapshotBinding: parsed.snapshotBinding,
            routeKind: parsed.routeKind,
            schemaVersion: parsed.schemaVersion,
            generation: parsed.generation,
            operationId: parsed.operationId,
        });
        prepared = parsePrepareResult(result);
    }
    catch {
        return { kind: "failure", failure: failure("capture_unavailable", 503) };
    }
    if (prepared === null || !matchingReceipt(parsed, prepared.receipt)) {
        return {
            kind: "failure",
            failure: failure(prepared === null ? "capture_unavailable" : "capture_binding_mismatch", prepared === null ? 503 : 409),
        };
    }
    if (prepared.kind === "existing" && prepared.receipt.state !== "prepared") {
        return { kind: "existing", receipt: prepared.receipt };
    }
    if (prepared.receipt.state !== "prepared") {
        return { kind: "failure", failure: failure("capture_unavailable", 503) };
    }
    let claimed;
    try {
        const result = await ports.capture.claimProviderAdmission({
            captureId: prepared.receipt.captureId,
            subjectRef: parsed.subjectRef,
            snapshotHandle: parsed.snapshotHandle,
            snapshotBinding: parsed.snapshotBinding,
            routeKind: parsed.routeKind,
            schemaVersion: parsed.schemaVersion,
            operationId: parsed.operationId,
            expectedState: "prepared",
            expectedStateVersion: prepared.receipt.stateVersion,
            expectedGeneration: prepared.receipt.generation,
        });
        claimed = parseClaimResult(result);
    }
    catch {
        return { kind: "failure", failure: failure("capture_unavailable", 503) };
    }
    if (claimed === null)
        return { kind: "failure", failure: failure("capture_unavailable", 503) };
    if (!matchingReceipt(parsed, claimed.receipt, prepared.receipt.captureId)) {
        return { kind: "failure", failure: failure("capture_binding_mismatch", 409) };
    }
    if (claimed.kind === "existing")
        return { kind: "existing", receipt: claimed.receipt };
    const claimedVersion = nextStateVersion(prepared.receipt.stateVersion);
    if (claimedVersion === null || claimed.receipt.stateVersion !== claimedVersion) {
        return { kind: "failure", failure: failure("capture_state_conflict", 409) };
    }
    let outcome;
    try {
        outcome = parseProviderResult(await ports.provider.call({
            captureId: claimed.receipt.captureId,
            executionId: claimed.receipt.executionId,
            snapshotHandle: claimed.receipt.snapshotHandle,
            snapshotBinding: claimed.receipt.snapshotBinding,
            routeKind: claimed.receipt.routeKind,
            schemaVersion: claimed.receipt.schemaVersion,
        }));
    }
    catch {
        return { kind: "failure", failure: failure("provider_outcome_uncertain", 502) };
    }
    if (outcome === null)
        return { kind: "failure", failure: failure("provider_outcome_uncertain", 502) };
    try {
        const recorded = CaptureReceiptSchema.safeParse(await ports.capture.recordOutcome({
            captureId: claimed.receipt.captureId,
            executionId: claimed.receipt.executionId,
            expectedStateVersion: claimed.receipt.stateVersion,
            expectedGeneration: claimed.receipt.generation,
            operationId: parsed.operationId,
            outcome,
        }));
        const expectedState = outcome.kind === "success" ? "completed" : "scan_failed";
        const recordedVersion = nextStateVersion(claimed.receipt.stateVersion);
        if (!recorded.success ||
            !matchingReceipt(parsed, recorded.data, claimed.receipt.captureId) ||
            recorded.data.executionId !== claimed.receipt.executionId ||
            recorded.data.state !== expectedState ||
            recordedVersion === null ||
            recorded.data.stateVersion !== recordedVersion)
            return { kind: "failure", failure: failure("outcome_record_unavailable", 503) };
        return { kind: "recorded", receipt: recorded.data, outcome };
    }
    catch {
        return { kind: "failure", failure: failure("outcome_record_unavailable", 503) };
    }
}
//# sourceMappingURL=admission.js.map