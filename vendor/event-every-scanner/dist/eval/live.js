import { ProviderScanObservationSchema } from "../contracts.js";
import { z } from "zod";
import { EvalCorpusSchema } from "./contracts.js";
import { scoreCase } from "./score.js";
import { SafeEvalFailureSchema } from "./report.js";
import { SpendReservationSchema, SpendSnapshotSchema, ActualChargeEvidenceSchema, NoChargeEvidenceSchema, validateChargeBound, weekKey, } from "./spend.js";
const PaidEvalCallResultSchema = z.discriminatedUnion("outcome", [
    z.strictObject({
        outcome: z.literal("settled"),
        result: z.discriminatedUnion("kind", [
            z.strictObject({ kind: z.literal("success"), observation: z.unknown() }),
            z.strictObject({ kind: z.literal("failure"), failure: SafeEvalFailureSchema }),
        ]),
        evidence: ActualChargeEvidenceSchema,
    }),
    z.strictObject({ outcome: z.literal("no_charge"), failure: SafeEvalFailureSchema, proof: NoChargeEvidenceSchema }),
    z.strictObject({ outcome: z.literal("ambiguous"), failure: SafeEvalFailureSchema }),
]).readonly();
function refuse() { throw new Error("live_evaluation_refused"); }
function sameIds(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function failure(code) { return { code, retryable: false, httpStatus: null }; }
function failureForThrown() { return failure("transport_network"); }
function nextReservation(snapshot, reservationId) {
    const reservation = snapshot.reservations.find((item) => item.reservationId === reservationId);
    if (reservation === undefined)
        return null;
    return SpendReservationSchema.safeParse(reservation).success ? reservation : null;
}
function nextCall(reservation) {
    const index = reservation.resolutions.length;
    const call = reservation.plannedCalls[index];
    if (reservation.state !== "open" || call === undefined || call.ceilingMicros > reservation.heldMicros)
        return null;
    return call;
}
function normalizedFixturePath(value) {
    return !value.includes("\0") && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
async function resolveSources(caseId, sources, resolver, digest) {
    try {
        for (const source of sources) {
            const resolved = await resolver.resolve({ caseId, source });
            if (source.kind !== "image")
                continue;
            if (resolved.fixturePath !== source.fixturePath || !normalizedFixturePath(resolved.fixturePath) || resolved.mediaType !== source.mediaType || digest(resolved.digestInput) !== source.fixtureSha256)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
export async function runOfflineEvaluation(input) {
    const corpus = EvalCorpusSchema.parse(input.corpus);
    return { mode: "offline", scorecards: corpus.cases.map((caseData) => scoreCase(caseData, input.actuals[caseData.caseId], input.digest)) };
}
export async function runLiveEvaluation(input) {
    if (input.mode !== "live" || input.confirmPaid !== true || input.sourceResolver === null || input.paidCallPort === null || input.spendAuthority === null || input.hostMetadata.credentialPresent !== true)
        refuse();
    const sourceResolver = input.sourceResolver;
    const paidCallPort = input.paidCallPort;
    const spendAuthority = input.spendAuthority;
    let corpus;
    let bound;
    const now = input.clock.now();
    try {
        corpus = EvalCorpusSchema.parse(input.corpus);
        bound = validateChargeBound(input.chargeBound, now);
    }
    catch {
        refuse();
    }
    if (bound.corpusId !== corpus.corpusId || bound.corpusVersion !== corpus.corpusVersion)
        refuse();
    const selectedCases = bound.selectedCaseIds.map((caseId) => corpus.cases.find((caseData) => caseData.caseId === caseId));
    const plannedCallIds = bound.calls.map((call) => call.callId);
    if (selectedCases.some((caseData) => caseData === undefined) || selectedCases.length !== bound.calls.length || !sameIds(corpus.cases.filter((caseData) => bound.selectedCaseIds.includes(caseData.caseId)).map((caseData) => caseData.caseId), bound.selectedCaseIds))
        refuse();
    for (let index = 0; index < bound.calls.length; index += 1) {
        const caseData = selectedCases[index];
        const call = bound.calls[index];
        if (call.modelId !== input.hostMetadata.models[caseData.kind])
            refuse();
    }
    let initial;
    try {
        initial = SpendSnapshotSchema.parse(await spendAuthority.inspect(weekKey(now)));
    }
    catch {
        refuse();
    }
    if (initial.weekKey !== weekKey(now) || initial.availableMicros < bound.runCeilingMicros)
        refuse();
    let reservation;
    try {
        reservation = await spendAuthority.reserveRun({ weekKey: weekKey(now), now, plannedCallIds, chargeBound: bound });
        reservation = SpendReservationSchema.parse(reservation);
    }
    catch {
        refuse();
    }
    if (reservation.weekKey !== weekKey(now) || reservation.state !== "open" || !sameIds(reservation.plannedCallIds, plannedCallIds))
        refuse();
    const scorecards = [];
    const failures = [];
    const proveNoChargeBeforeTransport = async (caseId, callId, reason, safe) => {
        while (reservation.resolutions.length < reservation.plannedCallIds.length) {
            const nextCallId = reservation.plannedCallIds.find((plannedId) => !reservation.resolutions.some((resolution) => (resolution.kind === "actual" ? resolution.evidence.callId : resolution.proof.callId) === plannedId));
            if (nextCallId === undefined)
                refuse();
            const nextCaseId = bound.selectedCaseIds[reservation.plannedCallIds.indexOf(nextCallId)] ?? caseId;
            const proof = NoChargeEvidenceSchema.parse({ schemaVersion: 1, proofId: `no-charge-${reservation.reservationId}-${nextCallId}-${reason}`, callId: nextCallId, reservationId: reservation.reservationId, reason });
            try {
                reservation = SpendReservationSchema.parse(await spendAuthority.recordNoCharge({ reservationId: reservation.reservationId, proof }));
            }
            catch {
                refuse();
            }
            failures.push({ caseId: nextCaseId, callId: nextCallId, failure: safe });
        }
        if (reservation.resolutions.length === reservation.plannedCallIds.length) {
            try {
                const snapshot = await spendAuthority.close({ reservationId: reservation.reservationId, now: input.clock.now() });
                reservation = nextReservation(snapshot, reservation.reservationId) ?? reservation;
                return { mode: "live", scorecards, failures, reservation, snapshot };
            }
            catch {
                refuse();
            }
        }
        return { mode: "live", scorecards, failures, reservation, snapshot: null };
    };
    const unresolved = async (caseId, callId, safe) => {
        try {
            const marked = SpendReservationSchema.parse(await spendAuthority.markAmbiguous({ reservationId: reservation.reservationId, callId, failure: safe }));
            if (marked.state !== "unresolved" || marked.ambiguousCallId !== callId || marked.ambiguousFailure === null)
                refuse();
            reservation = marked;
        }
        catch {
            refuse();
        }
        failures.push({ caseId, callId, failure: safe });
        return { mode: "live", scorecards, failures, reservation, snapshot: null };
    };
    for (let index = 0; index < selectedCases.length; index += 1) {
        const caseData = selectedCases[index];
        const boundCall = bound.calls[index];
        const current = input.clock.now();
        if (weekKey(current) !== reservation.weekKey) {
            return proveNoChargeBeforeTransport(caseData.caseId, boundCall.callId, "week_rollover_before_transport", failure("local_validation"));
        }
        try {
            const inspected = SpendSnapshotSchema.parse(await spendAuthority.inspect(reservation.weekKey));
            const currentReservation = nextReservation(inspected, reservation.reservationId);
            if (currentReservation === null)
                refuse();
            reservation = currentReservation;
        }
        catch {
            refuse();
        }
        const call = nextCall(reservation);
        if (call === null || call.callId !== boundCall.callId || call.ceilingMicros !== boundCall.ceilingMicros)
            refuse();
        if (!await resolveSources(caseData.caseId, caseData.sources, sourceResolver, input.digest)) {
            return proveNoChargeBeforeTransport(caseData.caseId, call.callId, "local_validation_before_transport", failure("source_resolution"));
        }
        try {
            const inspected = SpendSnapshotSchema.parse(await spendAuthority.inspect(reservation.weekKey));
            const currentReservation = nextReservation(inspected, reservation.reservationId);
            if (currentReservation === null)
                refuse();
            reservation = currentReservation;
        }
        catch {
            refuse();
        }
        if (weekKey(input.clock.now()) !== reservation.weekKey) {
            return proveNoChargeBeforeTransport(caseData.caseId, call.callId, "week_rollover_before_transport", failure("local_validation"));
        }
        const admittedCall = nextCall(reservation);
        if (admittedCall === null || admittedCall.callId !== call.callId || admittedCall.ceilingMicros !== call.ceilingMicros)
            refuse();
        const request = { caseId: caseData.caseId, sources: caseData.sources, callId: call.callId, reservationId: reservation.reservationId, modelId: boundCall.modelId, modelKind: caseData.kind };
        let outcome;
        try {
            outcome = await paidCallPort.call(request);
        }
        catch {
            return unresolved(caseData.caseId, call.callId, failureForThrown());
        }
        const parsedOutcome = PaidEvalCallResultSchema.safeParse(outcome);
        if (!parsedOutcome.success)
            return unresolved(caseData.caseId, call.callId, failure("billing_evidence_invalid"));
        const paidOutcome = parsedOutcome.data;
        if (paidOutcome.outcome === "ambiguous")
            return unresolved(caseData.caseId, call.callId, paidOutcome.failure);
        if (paidOutcome.outcome === "no_charge") {
            if (paidOutcome.proof.callId !== call.callId || paidOutcome.proof.reservationId !== reservation.reservationId)
                return unresolved(caseData.caseId, call.callId, failure("billing_evidence_invalid"));
            try {
                reservation = await spendAuthority.recordNoCharge({ reservationId: reservation.reservationId, proof: paidOutcome.proof });
            }
            catch {
                return unresolved(caseData.caseId, call.callId, failure("billing_evidence_invalid"));
            }
            failures.push({ caseId: caseData.caseId, callId: call.callId, failure: paidOutcome.failure });
            continue;
        }
        if (paidOutcome.evidence.callId !== call.callId || paidOutcome.evidence.reservationId !== reservation.reservationId)
            return unresolved(caseData.caseId, call.callId, failure("billing_evidence_invalid"));
        try {
            reservation = await spendAuthority.recordActual({ reservationId: reservation.reservationId, evidence: paidOutcome.evidence });
        }
        catch {
            return unresolved(caseData.caseId, call.callId, failure("billing_evidence_invalid"));
        }
        if (reservation.state !== "open" && index + 1 < selectedCases.length) {
            failures.push({ caseId: caseData.caseId, callId: call.callId, failure: failure("billing_evidence_invalid") });
            return { mode: "live", scorecards, failures, reservation, snapshot: null };
        }
        if (paidOutcome.result.kind === "failure") {
            failures.push({ caseId: caseData.caseId, callId: call.callId, failure: paidOutcome.result.failure });
            continue;
        }
        const observation = ProviderScanObservationSchema.safeParse(paidOutcome.result.observation);
        if (!observation.success) {
            failures.push({ caseId: caseData.caseId, callId: call.callId, failure: failure("observation_invalid") });
            continue;
        }
        scorecards.push(scoreCase(caseData, observation.data, input.digest));
    }
    let snapshot = null;
    try {
        snapshot = await spendAuthority.close({ reservationId: reservation.reservationId, now: input.clock.now() });
        reservation = nextReservation(snapshot, reservation.reservationId) ?? reservation;
    }
    catch {
        return { mode: "live", scorecards, failures, reservation, snapshot: null };
    }
    return { mode: "live", scorecards, failures, reservation, snapshot };
}
//# sourceMappingURL=live.js.map