import { z } from "zod";
import { SafeEvalFailureSchema } from "./report.js";
import { sha256Canonical } from "./digest.js";
export const WEEKLY_CAP_MICROS = 5_000_000;
const MILLION = 1_000_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const Identifier = z.string().min(1).max(256).regex(/^[A-Za-z0-9:_-]+$/);
// Provider model IDs are opaque but OpenRouter's canonical fixed IDs contain
// one slash (for example `deepseek/deepseek-v4-flash`).  Keep other persisted
// identifiers closed while admitting this documented model namespace form.
const ModelIdentifier = z.string().min(1).max(256).regex(/^[A-Za-z0-9:_/-]+$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/i);
const Micros = z.number().int().safe().nonnegative();
const PositiveMicros = Micros.positive();
const Timestamp = z.string().datetime({ offset: true });
function fail(code) { throw new Error(code); }
function parsedTime(value) {
    const time = Date.parse(value);
    if (!Number.isSafeInteger(time))
        fail("spend_timestamp_invalid");
    return time;
}
function checkedAdd(left, right) {
    const total = left + right;
    if (!Number.isSafeInteger(total) || total < 0)
        fail("spend_arithmetic_invalid");
    return total;
}
function checkedSubtract(left, right) {
    const total = left - right;
    if (!Number.isSafeInteger(total) || total < 0)
        fail("spend_arithmetic_invalid");
    return total;
}
function checkedMultiply(left, right) {
    const total = left * right;
    if (!Number.isSafeInteger(total) || total < 0)
        fail("spend_arithmetic_invalid");
    return total;
}
function ceilDiv(value, divisor) {
    if (!Number.isSafeInteger(value) || value < 0 || divisor <= 0)
        fail("spend_arithmetic_invalid");
    return Math.floor(checkedAdd(value, divisor - 1) / divisor);
}
export function weekKey(input) {
    const date = new Date(parsedTime(input));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const year = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const firstDay = firstThursday.getUTCDay() || 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
    const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1_000));
    return `openrouter-budget:${year}-W${String(week).padStart(2, "0")}`;
}
export const PricingRowSchema = z.strictObject({
    modelId: ModelIdentifier,
    inputMicrosPerMillionTokens: Micros,
    outputMicrosPerMillionTokens: Micros,
    imageMicrosPerUnit: Micros,
}).readonly();
export const ChargeBoundCallSchema = z.strictObject({
    callId: Identifier,
    modelId: ModelIdentifier,
    maxInputTokens: Micros,
    maxOutputTokens: Micros,
    maxImages: Micros,
    pricing: PricingRowSchema,
    ceilingMicros: PositiveMicros,
}).readonly();
export const ChargeBoundSchema = z.strictObject({
    schemaVersion: z.literal(1),
    digest: Digest,
    evidenceSource: Identifier,
    evidenceDigest: Digest,
    observedAt: Timestamp,
    validFrom: Timestamp,
    validUntil: Timestamp,
    calls: z.array(ChargeBoundCallSchema).min(1).readonly(),
    runCeilingMicros: PositiveMicros,
    corpusId: Identifier,
    corpusVersion: Identifier,
    selectedCaseIds: z.array(Identifier).min(1).readonly(),
}).readonly();
export const ActualChargeEvidenceSchema = z.strictObject({
    schemaVersion: z.literal(1),
    evidenceId: Identifier,
    callId: Identifier,
    reservationId: Identifier,
    providerRequestIdDigest: Digest,
    chargedMicros: Micros,
    admittedAt: Timestamp,
}).readonly();
export const NoChargeEvidenceSchema = z.strictObject({
    schemaVersion: z.literal(1),
    proofId: Identifier,
    callId: Identifier,
    reservationId: Identifier,
    reason: z.enum(["local_validation_before_transport", "week_rollover_before_transport", "transport_refused_before_admission"]),
}).readonly();
const PlannedCallSchema = z.strictObject({ callId: Identifier, ceilingMicros: PositiveMicros }).readonly();
const CallResolutionSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("actual"), evidence: ActualChargeEvidenceSchema }),
    z.strictObject({ kind: z.literal("no_charge"), proof: NoChargeEvidenceSchema }),
]).readonly();
export const SpendReservationSchema = z.strictObject({
    schemaVersion: z.literal(1),
    reservationId: Identifier,
    weekKey: z.string().regex(/^openrouter-budget:\d{4}-W\d{2}$/),
    chargeBoundDigest: Digest,
    reservedMaximumMicros: PositiveMicros,
    settledActualMicros: Micros,
    heldMicros: Micros,
    plannedCallIds: z.array(Identifier).min(1).readonly(),
    plannedCalls: z.array(PlannedCallSchema).min(1).readonly(),
    plannedCallBinding: Digest,
    committedChargeBound: ChargeBoundSchema,
    actualEvidenceIds: z.array(Identifier).readonly(),
    noChargeProofIds: z.array(Identifier).readonly(),
    resolutions: z.array(CallResolutionSchema).readonly(),
    ambiguousCallId: Identifier.nullable(),
    ambiguousFailure: SafeEvalFailureSchema.nullable(),
    state: z.enum(["open", "closed", "unresolved"]),
}).readonly().superRefine((value, context) => {
    const actual = value.resolutions.filter((resolution) => resolution.kind === "actual").map((resolution) => resolution.evidence);
    const proofs = value.resolutions.filter((resolution) => resolution.kind === "no_charge").map((resolution) => resolution.proof);
    const actualIds = actual.map((evidence) => evidence.evidenceId);
    const proofIds = proofs.map((proof) => proof.proofId);
    const plannedIds = value.plannedCalls.map((call) => call.callId);
    const committedCalls = value.committedChargeBound.calls.map((call) => ({ callId: call.callId, ceilingMicros: call.ceilingMicros }));
    const plannedCeilingTotal = value.plannedCalls.reduce((total, call) => total + call.ceilingMicros, 0);
    const settled = actual.reduce((total, evidence) => total + evidence.chargedMicros, 0);
    const expectedHeld = Number.isSafeInteger(settled) ? (value.state === "closed" ? 0 : Math.max(0, value.reservedMaximumMicros - settled)) : -1;
    const resolutionCallIds = value.resolutions.map((resolution) => resolution.kind === "actual" ? resolution.evidence.callId : resolution.proof.callId);
    const expectedCalls = value.plannedCallIds.slice(0, value.resolutions.length);
    const hasOverrun = actual.some((evidence) => {
        const planned = value.plannedCalls.find((call) => call.callId === evidence.callId);
        return planned === undefined || evidence.chargedMicros > planned.ceilingMicros;
    });
    const ambiguityValid = (value.ambiguousCallId === null) === (value.ambiguousFailure === null)
        && (value.ambiguousCallId === null || (value.state === "unresolved" && value.ambiguousCallId === value.plannedCallIds[value.resolutions.length]));
    if (!unique(value.plannedCallIds) || !sameOrder(value.plannedCallIds, plannedIds) || value.chargeBoundDigest !== value.committedChargeBound.digest || !validCommittedChargeBound(value.committedChargeBound) || !samePlannedCalls(value.plannedCalls, committedCalls) || !Number.isSafeInteger(plannedCeilingTotal) || value.reservedMaximumMicros !== plannedCeilingTotal || value.reservedMaximumMicros !== value.committedChargeBound.runCeilingMicros || value.plannedCallBinding !== plannedCallBinding(value.chargeBoundDigest, value.plannedCalls) || !unique(actualIds) || !unique(proofIds) || actualIds.some((id) => proofIds.includes(id)) || !sameOrder(value.actualEvidenceIds, actualIds) || !sameOrder(value.noChargeProofIds, proofIds) || !sameOrder(resolutionCallIds, expectedCalls) || actual.some((evidence) => evidence.reservationId !== value.reservationId || weekKey(evidence.admittedAt) !== value.weekKey) || proofs.some((proof) => proof.reservationId !== value.reservationId) || !Number.isSafeInteger(settled) || value.settledActualMicros !== settled || value.heldMicros !== expectedHeld || !ambiguityValid || (value.state === "closed" && (value.resolutions.length !== value.plannedCallIds.length || value.heldMicros !== 0 || value.ambiguousCallId !== null || hasOverrun)) || (value.state === "open" && (value.ambiguousCallId !== null || hasOverrun)))
        context.addIssue({ code: "custom", path: [], message: "spend_reservation_invalid" });
});
export const SpendSnapshotSchema = z.strictObject({
    schemaVersion: z.literal(1),
    weekKey: z.string().regex(/^openrouter-budget:\d{4}-W\d{2}$/),
    capMicros: z.literal(WEEKLY_CAP_MICROS),
    settledActualMicros: Micros,
    heldMicros: Micros,
    availableMicros: Micros,
    reservations: z.array(SpendReservationSchema).readonly(),
}).readonly().superRefine((value, context) => {
    const settled = value.reservations.reduce((total, reservation) => total + reservation.settledActualMicros, 0);
    const held = value.reservations.reduce((total, reservation) => total + reservation.heldMicros, 0);
    const reservationIds = value.reservations.map((reservation) => reservation.reservationId);
    const evidenceIds = value.reservations.flatMap((reservation) => reservation.actualEvidenceIds);
    const proofIds = value.reservations.flatMap((reservation) => reservation.noChargeProofIds);
    const exceedsCap = settled + held > WEEKLY_CAP_MICROS;
    let totalReservationOverrunExcess = 0;
    let overrunArithmeticValid = true;
    try {
        for (const reservation of value.reservations)
            totalReservationOverrunExcess = checkedAdd(totalReservationOverrunExcess, Math.max(0, reservation.settledActualMicros - reservation.reservedMaximumMicros));
    }
    catch {
        overrunArithmeticValid = false;
    }
    let authorizedTotal = -1;
    try {
        authorizedTotal = checkedSubtract(checkedAdd(settled, held), totalReservationOverrunExcess);
    }
    catch {
        overrunArithmeticValid = false;
    }
    const expectedAvailable = exceedsCap ? 0 : WEEKLY_CAP_MICROS - settled - held;
    if (!Number.isSafeInteger(settled) || !Number.isSafeInteger(held) || !Number.isSafeInteger(settled + held) || !unique(reservationIds) || !unique(evidenceIds) || !unique(proofIds) || evidenceIds.some((id) => proofIds.includes(id)) || value.reservations.some((reservation) => reservation.weekKey !== value.weekKey) || value.settledActualMicros !== settled || value.heldMicros !== held || value.availableMicros !== expectedAvailable || value.availableMicros < 0 || (exceedsCap && (!overrunArithmeticValid || totalReservationOverrunExcess === 0 || authorizedTotal > WEEKLY_CAP_MICROS)))
        context.addIssue({ code: "custom", path: [], message: "spend_snapshot_invalid" });
});
export const ReserveRunRequestSchema = z.strictObject({
    weekKey: z.string().regex(/^openrouter-budget:\d{4}-W\d{2}$/),
    now: Timestamp,
    plannedCallIds: z.array(Identifier).min(1).readonly(),
    chargeBound: ChargeBoundSchema,
}).readonly();
export const RecordActualRequestSchema = z.strictObject({ reservationId: Identifier, evidence: ActualChargeEvidenceSchema }).readonly();
export const RecordNoChargeRequestSchema = z.strictObject({ reservationId: Identifier, proof: NoChargeEvidenceSchema }).readonly();
export const MarkAmbiguousRequestSchema = z.strictObject({ reservationId: Identifier, callId: Identifier, failure: SafeEvalFailureSchema }).readonly();
export const CloseReservationRequestSchema = z.strictObject({ reservationId: Identifier, now: Timestamp }).readonly();
function sameOrder(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function samePlannedCalls(left, right) { return left.length === right.length && left.every((call, index) => call.callId === right[index]?.callId && call.ceilingMicros === right[index]?.ceilingMicros); }
function unique(values) { return new Set(values).size === values.length; }
function plannedCallBinding(chargeBoundDigest, calls) { return sha256Canonical({ chargeBoundDigest, calls }); }
function chargeBoundContents(bound) {
    return {
        schemaVersion: bound.schemaVersion,
        evidenceSource: bound.evidenceSource,
        evidenceDigest: bound.evidenceDigest,
        observedAt: bound.observedAt,
        validFrom: bound.validFrom,
        validUntil: bound.validUntil,
        calls: bound.calls,
        runCeilingMicros: bound.runCeilingMicros,
        corpusId: bound.corpusId,
        corpusVersion: bound.corpusVersion,
        selectedCaseIds: bound.selectedCaseIds,
    };
}
function chargeBoundCommitment(bound) { return sha256Canonical(chargeBoundContents(bound)); }
function validCommittedChargeBound(bound) {
    try {
        if (bound.digest !== chargeBoundCommitment(bound))
            return false;
        const observedAt = parsedTime(bound.observedAt);
        const validFrom = parsedTime(bound.validFrom);
        const validUntil = parsedTime(bound.validUntil);
        if (observedAt > validFrom || validFrom > validUntil || validUntil - observedAt > SEVEN_DAYS_MS || !unique(bound.selectedCaseIds) || bound.runCeilingMicros > WEEKLY_CAP_MICROS)
            return false;
        const total = bound.calls.reduce((sum, call) => checkedAdd(sum, ceiling(call)), 0);
        return total === bound.runCeilingMicros && bound.calls.every((call) => ceiling(call) === call.ceilingMicros);
    }
    catch {
        return false;
    }
}
function ceiling(call) {
    if (call.modelId !== call.pricing.modelId)
        fail("charge_bound_invalid");
    const input = checkedMultiply(call.maxInputTokens, call.pricing.inputMicrosPerMillionTokens);
    const output = checkedMultiply(call.maxOutputTokens, call.pricing.outputMicrosPerMillionTokens);
    const tokenMicros = ceilDiv(checkedAdd(input, output), MILLION);
    return checkedAdd(tokenMicros, checkedMultiply(call.maxImages, call.pricing.imageMicrosPerUnit));
}
function validateChargeBoundInternal(input, now, plannedCallIds) {
    const bound = ChargeBoundSchema.parse(input);
    const observedAt = parsedTime(bound.observedAt);
    const validFrom = parsedTime(bound.validFrom);
    const validUntil = parsedTime(bound.validUntil);
    const current = parsedTime(now);
    if (bound.digest !== chargeBoundCommitment(bound) || observedAt > validFrom || validFrom > validUntil || current < validFrom || current > validUntil || current - observedAt > SEVEN_DAYS_MS || validUntil - observedAt > SEVEN_DAYS_MS || !unique(bound.selectedCaseIds))
        fail("charge_bound_invalid");
    const callIds = bound.calls.map((call) => call.callId);
    if (!unique(callIds) || !sameOrder(callIds, plannedCallIds ?? callIds))
        fail("charge_bound_invalid");
    let runCeiling = 0;
    for (const call of bound.calls) {
        const computed = ceiling(call);
        if (computed !== call.ceilingMicros)
            fail("charge_bound_invalid");
        runCeiling = checkedAdd(runCeiling, computed);
    }
    if (runCeiling !== bound.runCeilingMicros || runCeiling > WEEKLY_CAP_MICROS)
        fail("charge_bound_invalid");
    return bound;
}
export function validateChargeBound(input, now, plannedCallIds) {
    try {
        return validateChargeBoundInternal(input, now, plannedCallIds);
    }
    catch {
        return fail("charge_bound_invalid");
    }
}
function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function resolvedCount(reservation) { return reservation.resolutions.length; }
function nextCall(reservation) {
    const call = reservation.plannedCalls[resolvedCount(reservation)];
    if (reservation.state !== "open" || call === undefined)
        fail("reservation_transition_invalid");
    return call;
}
export function reserveRun(snapshotInput, requestInput, reservationId) {
    const snapshot = SpendSnapshotSchema.parse(snapshotInput);
    const request = ReserveRunRequestSchema.parse(requestInput);
    if (snapshot.weekKey !== request.weekKey || request.weekKey !== weekKey(request.now) || snapshot.reservations.some((reservation) => reservation.reservationId === reservationId))
        fail("reservation_refused");
    const bound = validateChargeBound(request.chargeBound, request.now, request.plannedCallIds);
    if (!unique(request.plannedCallIds) || !sameOrder(request.plannedCallIds, bound.calls.map((call) => call.callId)) || checkedAdd(checkedAdd(snapshot.settledActualMicros, snapshot.heldMicros), bound.runCeilingMicros) > WEEKLY_CAP_MICROS)
        fail("reservation_refused");
    const plannedCalls = bound.calls.map((call) => ({ callId: call.callId, ceilingMicros: call.ceilingMicros }));
    return SpendReservationSchema.parse({ schemaVersion: 1, reservationId, weekKey: request.weekKey, chargeBoundDigest: bound.digest, reservedMaximumMicros: bound.runCeilingMicros, settledActualMicros: 0, heldMicros: bound.runCeilingMicros, plannedCallIds: request.plannedCallIds, plannedCalls, plannedCallBinding: plannedCallBinding(bound.digest, plannedCalls), committedChargeBound: bound, actualEvidenceIds: [], noChargeProofIds: [], resolutions: [], ambiguousCallId: null, ambiguousFailure: null, state: "open" });
}
export function recordActual(reservationInput, evidenceInput) {
    const reservation = SpendReservationSchema.parse(reservationInput);
    const evidence = ActualChargeEvidenceSchema.parse(evidenceInput);
    if (evidence.reservationId !== reservation.reservationId)
        fail("reservation_transition_invalid");
    const existing = reservation.resolutions.find((resolution) => resolution.kind === "actual" && resolution.evidence.evidenceId === evidence.evidenceId);
    if (existing !== undefined) {
        if (existing.kind === "actual" && sameValue(existing.evidence, evidence))
            return reservation;
        fail("reservation_transition_invalid");
    }
    const planned = nextCall(reservation);
    if (evidence.callId !== planned.callId || weekKey(evidence.admittedAt) !== reservation.weekKey)
        fail("reservation_transition_invalid");
    if (reservation.noChargeProofIds.includes(evidence.evidenceId))
        fail("reservation_transition_invalid");
    const heldReduction = Math.min(reservation.heldMicros, evidence.chargedMicros);
    return SpendReservationSchema.parse({ ...reservation, settledActualMicros: checkedAdd(reservation.settledActualMicros, evidence.chargedMicros), heldMicros: checkedSubtract(reservation.heldMicros, heldReduction), actualEvidenceIds: [...reservation.actualEvidenceIds, evidence.evidenceId], resolutions: [...reservation.resolutions, { kind: "actual", evidence }], state: evidence.chargedMicros > planned.ceilingMicros ? "unresolved" : "open" });
}
export function recordNoCharge(reservationInput, proofInput) {
    const reservation = SpendReservationSchema.parse(reservationInput);
    const proof = NoChargeEvidenceSchema.parse(proofInput);
    if (proof.reservationId !== reservation.reservationId)
        fail("reservation_transition_invalid");
    const existing = reservation.resolutions.find((resolution) => resolution.kind === "no_charge" && resolution.proof.proofId === proof.proofId);
    if (existing !== undefined) {
        if (existing.kind === "no_charge" && sameValue(existing.proof, proof))
            return reservation;
        fail("reservation_transition_invalid");
    }
    if (proof.callId !== nextCall(reservation).callId)
        fail("reservation_transition_invalid");
    if (reservation.actualEvidenceIds.includes(proof.proofId))
        fail("reservation_transition_invalid");
    return SpendReservationSchema.parse({ ...reservation, noChargeProofIds: [...reservation.noChargeProofIds, proof.proofId], resolutions: [...reservation.resolutions, { kind: "no_charge", proof }] });
}
export function markAmbiguous(reservationInput, requestInput) {
    const reservation = SpendReservationSchema.parse(reservationInput);
    const request = MarkAmbiguousRequestSchema.parse(requestInput);
    if (request.reservationId !== reservation.reservationId)
        fail("reservation_transition_invalid");
    if (reservation.state === "unresolved") {
        if (reservation.ambiguousCallId === request.callId && sameValue(reservation.ambiguousFailure, request.failure))
            return reservation;
        fail("reservation_transition_invalid");
    }
    if (request.callId !== nextCall(reservation).callId)
        fail("reservation_transition_invalid");
    return SpendReservationSchema.parse({ ...reservation, state: "unresolved", ambiguousCallId: request.callId, ambiguousFailure: request.failure });
}
export function close(reservationInput, requestInput) {
    const reservation = SpendReservationSchema.parse(reservationInput);
    const request = CloseReservationRequestSchema.parse(requestInput);
    if (request.reservationId !== reservation.reservationId)
        fail("reservation_transition_invalid");
    if (reservation.state === "closed")
        return reservation;
    if (reservation.state !== "open" || resolvedCount(reservation) !== reservation.plannedCallIds.length)
        fail("reservation_transition_invalid");
    return SpendReservationSchema.parse({ ...reservation, heldMicros: 0, state: "closed" });
}
export const checkedMicros = Object.freeze({ add: checkedAdd, subtract: checkedSubtract });
//# sourceMappingURL=spend.js.map