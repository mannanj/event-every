import { z } from "zod";
export declare const WEEKLY_CAP_MICROS = 5000000;
declare function checkedAdd(left: number, right: number): number;
declare function checkedSubtract(left: number, right: number): number;
export declare function weekKey(input: string): string;
export declare const PricingRowSchema: z.ZodReadonly<z.ZodObject<{
    modelId: z.ZodString;
    inputMicrosPerMillionTokens: z.ZodNumber;
    outputMicrosPerMillionTokens: z.ZodNumber;
    imageMicrosPerUnit: z.ZodNumber;
}, z.core.$strict>>;
export declare const ChargeBoundCallSchema: z.ZodReadonly<z.ZodObject<{
    callId: z.ZodString;
    modelId: z.ZodString;
    maxInputTokens: z.ZodNumber;
    maxOutputTokens: z.ZodNumber;
    maxImages: z.ZodNumber;
    pricing: z.ZodReadonly<z.ZodObject<{
        modelId: z.ZodString;
        inputMicrosPerMillionTokens: z.ZodNumber;
        outputMicrosPerMillionTokens: z.ZodNumber;
        imageMicrosPerUnit: z.ZodNumber;
    }, z.core.$strict>>;
    ceilingMicros: z.ZodNumber;
}, z.core.$strict>>;
export declare const ChargeBoundSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    digest: z.ZodString;
    evidenceSource: z.ZodString;
    evidenceDigest: z.ZodString;
    observedAt: z.ZodString;
    validFrom: z.ZodString;
    validUntil: z.ZodString;
    calls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        callId: z.ZodString;
        modelId: z.ZodString;
        maxInputTokens: z.ZodNumber;
        maxOutputTokens: z.ZodNumber;
        maxImages: z.ZodNumber;
        pricing: z.ZodReadonly<z.ZodObject<{
            modelId: z.ZodString;
            inputMicrosPerMillionTokens: z.ZodNumber;
            outputMicrosPerMillionTokens: z.ZodNumber;
            imageMicrosPerUnit: z.ZodNumber;
        }, z.core.$strict>>;
        ceilingMicros: z.ZodNumber;
    }, z.core.$strict>>>>;
    runCeilingMicros: z.ZodNumber;
    corpusId: z.ZodString;
    corpusVersion: z.ZodString;
    selectedCaseIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
}, z.core.$strict>>;
export declare const ActualChargeEvidenceSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    evidenceId: z.ZodString;
    callId: z.ZodString;
    reservationId: z.ZodString;
    providerRequestIdDigest: z.ZodString;
    chargedMicros: z.ZodNumber;
    admittedAt: z.ZodString;
}, z.core.$strict>>;
export declare const NoChargeEvidenceSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    proofId: z.ZodString;
    callId: z.ZodString;
    reservationId: z.ZodString;
    reason: z.ZodEnum<{
        local_validation_before_transport: "local_validation_before_transport";
        week_rollover_before_transport: "week_rollover_before_transport";
        transport_refused_before_admission: "transport_refused_before_admission";
    }>;
}, z.core.$strict>>;
export declare const SpendReservationSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    reservationId: z.ZodString;
    weekKey: z.ZodString;
    chargeBoundDigest: z.ZodString;
    reservedMaximumMicros: z.ZodNumber;
    settledActualMicros: z.ZodNumber;
    heldMicros: z.ZodNumber;
    plannedCallIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    plannedCalls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        callId: z.ZodString;
        ceilingMicros: z.ZodNumber;
    }, z.core.$strict>>>>;
    plannedCallBinding: z.ZodString;
    committedChargeBound: z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        digest: z.ZodString;
        evidenceSource: z.ZodString;
        evidenceDigest: z.ZodString;
        observedAt: z.ZodString;
        validFrom: z.ZodString;
        validUntil: z.ZodString;
        calls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            callId: z.ZodString;
            modelId: z.ZodString;
            maxInputTokens: z.ZodNumber;
            maxOutputTokens: z.ZodNumber;
            maxImages: z.ZodNumber;
            pricing: z.ZodReadonly<z.ZodObject<{
                modelId: z.ZodString;
                inputMicrosPerMillionTokens: z.ZodNumber;
                outputMicrosPerMillionTokens: z.ZodNumber;
                imageMicrosPerUnit: z.ZodNumber;
            }, z.core.$strict>>;
            ceilingMicros: z.ZodNumber;
        }, z.core.$strict>>>>;
        runCeilingMicros: z.ZodNumber;
        corpusId: z.ZodString;
        corpusVersion: z.ZodString;
        selectedCaseIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    actualEvidenceIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    noChargeProofIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    resolutions: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"actual">;
        evidence: z.ZodReadonly<z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            evidenceId: z.ZodString;
            callId: z.ZodString;
            reservationId: z.ZodString;
            providerRequestIdDigest: z.ZodString;
            chargedMicros: z.ZodNumber;
            admittedAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"no_charge">;
        proof: z.ZodReadonly<z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            proofId: z.ZodString;
            callId: z.ZodString;
            reservationId: z.ZodString;
            reason: z.ZodEnum<{
                local_validation_before_transport: "local_validation_before_transport";
                week_rollover_before_transport: "week_rollover_before_transport";
                transport_refused_before_admission: "transport_refused_before_admission";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>], "kind">>>>;
    ambiguousCallId: z.ZodNullable<z.ZodString>;
    ambiguousFailure: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            local_validation: "local_validation";
            source_resolution: "source_resolution";
            transport_network: "transport_network";
            transport_timeout: "transport_timeout";
            transport_http: "transport_http";
            privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
            provider_refusal: "provider_refusal";
            provider_empty: "provider_empty";
            provider_malformed: "provider_malformed";
            observation_invalid: "observation_invalid";
            billing_evidence_missing: "billing_evidence_missing";
            billing_evidence_invalid: "billing_evidence_invalid";
        }>;
        retryable: z.ZodBoolean;
        httpStatus: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>>;
    state: z.ZodEnum<{
        open: "open";
        closed: "closed";
        unresolved: "unresolved";
    }>;
}, z.core.$strict>>;
export declare const SpendSnapshotSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    weekKey: z.ZodString;
    capMicros: z.ZodLiteral<5000000>;
    settledActualMicros: z.ZodNumber;
    heldMicros: z.ZodNumber;
    availableMicros: z.ZodNumber;
    reservations: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        reservationId: z.ZodString;
        weekKey: z.ZodString;
        chargeBoundDigest: z.ZodString;
        reservedMaximumMicros: z.ZodNumber;
        settledActualMicros: z.ZodNumber;
        heldMicros: z.ZodNumber;
        plannedCallIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        plannedCalls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            callId: z.ZodString;
            ceilingMicros: z.ZodNumber;
        }, z.core.$strict>>>>;
        plannedCallBinding: z.ZodString;
        committedChargeBound: z.ZodReadonly<z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            digest: z.ZodString;
            evidenceSource: z.ZodString;
            evidenceDigest: z.ZodString;
            observedAt: z.ZodString;
            validFrom: z.ZodString;
            validUntil: z.ZodString;
            calls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                callId: z.ZodString;
                modelId: z.ZodString;
                maxInputTokens: z.ZodNumber;
                maxOutputTokens: z.ZodNumber;
                maxImages: z.ZodNumber;
                pricing: z.ZodReadonly<z.ZodObject<{
                    modelId: z.ZodString;
                    inputMicrosPerMillionTokens: z.ZodNumber;
                    outputMicrosPerMillionTokens: z.ZodNumber;
                    imageMicrosPerUnit: z.ZodNumber;
                }, z.core.$strict>>;
                ceilingMicros: z.ZodNumber;
            }, z.core.$strict>>>>;
            runCeilingMicros: z.ZodNumber;
            corpusId: z.ZodString;
            corpusVersion: z.ZodString;
            selectedCaseIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        actualEvidenceIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        noChargeProofIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        resolutions: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"actual">;
            evidence: z.ZodReadonly<z.ZodObject<{
                schemaVersion: z.ZodLiteral<1>;
                evidenceId: z.ZodString;
                callId: z.ZodString;
                reservationId: z.ZodString;
                providerRequestIdDigest: z.ZodString;
                chargedMicros: z.ZodNumber;
                admittedAt: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"no_charge">;
            proof: z.ZodReadonly<z.ZodObject<{
                schemaVersion: z.ZodLiteral<1>;
                proofId: z.ZodString;
                callId: z.ZodString;
                reservationId: z.ZodString;
                reason: z.ZodEnum<{
                    local_validation_before_transport: "local_validation_before_transport";
                    week_rollover_before_transport: "week_rollover_before_transport";
                    transport_refused_before_admission: "transport_refused_before_admission";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>], "kind">>>>;
        ambiguousCallId: z.ZodNullable<z.ZodString>;
        ambiguousFailure: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
            code: z.ZodEnum<{
                local_validation: "local_validation";
                source_resolution: "source_resolution";
                transport_network: "transport_network";
                transport_timeout: "transport_timeout";
                transport_http: "transport_http";
                privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
                provider_refusal: "provider_refusal";
                provider_empty: "provider_empty";
                provider_malformed: "provider_malformed";
                observation_invalid: "observation_invalid";
                billing_evidence_missing: "billing_evidence_missing";
                billing_evidence_invalid: "billing_evidence_invalid";
            }>;
            retryable: z.ZodBoolean;
            httpStatus: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>;
        state: z.ZodEnum<{
            open: "open";
            closed: "closed";
            unresolved: "unresolved";
        }>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export declare const ReserveRunRequestSchema: z.ZodReadonly<z.ZodObject<{
    weekKey: z.ZodString;
    now: z.ZodString;
    plannedCallIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    chargeBound: z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        digest: z.ZodString;
        evidenceSource: z.ZodString;
        evidenceDigest: z.ZodString;
        observedAt: z.ZodString;
        validFrom: z.ZodString;
        validUntil: z.ZodString;
        calls: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            callId: z.ZodString;
            modelId: z.ZodString;
            maxInputTokens: z.ZodNumber;
            maxOutputTokens: z.ZodNumber;
            maxImages: z.ZodNumber;
            pricing: z.ZodReadonly<z.ZodObject<{
                modelId: z.ZodString;
                inputMicrosPerMillionTokens: z.ZodNumber;
                outputMicrosPerMillionTokens: z.ZodNumber;
                imageMicrosPerUnit: z.ZodNumber;
            }, z.core.$strict>>;
            ceilingMicros: z.ZodNumber;
        }, z.core.$strict>>>>;
        runCeilingMicros: z.ZodNumber;
        corpusId: z.ZodString;
        corpusVersion: z.ZodString;
        selectedCaseIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$strict>>;
export declare const RecordActualRequestSchema: z.ZodReadonly<z.ZodObject<{
    reservationId: z.ZodString;
    evidence: z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        evidenceId: z.ZodString;
        callId: z.ZodString;
        reservationId: z.ZodString;
        providerRequestIdDigest: z.ZodString;
        chargedMicros: z.ZodNumber;
        admittedAt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>>;
export declare const RecordNoChargeRequestSchema: z.ZodReadonly<z.ZodObject<{
    reservationId: z.ZodString;
    proof: z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        proofId: z.ZodString;
        callId: z.ZodString;
        reservationId: z.ZodString;
        reason: z.ZodEnum<{
            local_validation_before_transport: "local_validation_before_transport";
            week_rollover_before_transport: "week_rollover_before_transport";
            transport_refused_before_admission: "transport_refused_before_admission";
        }>;
    }, z.core.$strict>>;
}, z.core.$strict>>;
export declare const MarkAmbiguousRequestSchema: z.ZodReadonly<z.ZodObject<{
    reservationId: z.ZodString;
    callId: z.ZodString;
    failure: z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            local_validation: "local_validation";
            source_resolution: "source_resolution";
            transport_network: "transport_network";
            transport_timeout: "transport_timeout";
            transport_http: "transport_http";
            privacy_endpoint_unavailable: "privacy_endpoint_unavailable";
            provider_refusal: "provider_refusal";
            provider_empty: "provider_empty";
            provider_malformed: "provider_malformed";
            observation_invalid: "observation_invalid";
            billing_evidence_missing: "billing_evidence_missing";
            billing_evidence_invalid: "billing_evidence_invalid";
        }>;
        retryable: z.ZodBoolean;
        httpStatus: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>>;
export declare const CloseReservationRequestSchema: z.ZodReadonly<z.ZodObject<{
    reservationId: z.ZodString;
    now: z.ZodString;
}, z.core.$strict>>;
export type PricingRow = z.infer<typeof PricingRowSchema>;
export type ChargeBoundCall = z.infer<typeof ChargeBoundCallSchema>;
export type ChargeBound = z.infer<typeof ChargeBoundSchema>;
export type ActualChargeEvidence = z.infer<typeof ActualChargeEvidenceSchema>;
export type NoChargeEvidence = z.infer<typeof NoChargeEvidenceSchema>;
export type SpendReservation = z.infer<typeof SpendReservationSchema>;
export type SpendSnapshot = z.infer<typeof SpendSnapshotSchema>;
export type ReserveRunRequest = z.infer<typeof ReserveRunRequestSchema>;
export type RecordActualRequest = z.infer<typeof RecordActualRequestSchema>;
export type RecordNoChargeRequest = z.infer<typeof RecordNoChargeRequestSchema>;
export type MarkAmbiguousRequest = z.infer<typeof MarkAmbiguousRequestSchema>;
export type CloseReservationRequest = z.infer<typeof CloseReservationRequestSchema>;
export declare function validateChargeBound(input: unknown, now: string, plannedCallIds?: readonly string[]): ChargeBound;
export declare function reserveRun(snapshotInput: unknown, requestInput: unknown, reservationId: string): SpendReservation;
export declare function recordActual(reservationInput: unknown, evidenceInput: unknown): SpendReservation;
export declare function recordNoCharge(reservationInput: unknown, proofInput: unknown): SpendReservation;
export declare function markAmbiguous(reservationInput: unknown, requestInput: unknown): SpendReservation;
export declare function close(reservationInput: unknown, requestInput: unknown): SpendReservation;
export declare const checkedMicros: Readonly<{
    add: typeof checkedAdd;
    subtract: typeof checkedSubtract;
}>;
export {};
//# sourceMappingURL=spend.d.ts.map