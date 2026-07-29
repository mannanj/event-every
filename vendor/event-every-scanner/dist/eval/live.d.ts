import { type EvalSource } from "./contracts.js";
import { type DigestPort, type EvalCaseScorecard } from "./score.js";
import { type EvalCaseFailure, type SafeEvalFailure } from "./report.js";
import { type ActualChargeEvidence, type CloseReservationRequest, type MarkAmbiguousRequest, type NoChargeEvidence, type RecordActualRequest, type RecordNoChargeRequest, type ReserveRunRequest, type SpendReservation, type SpendSnapshot } from "./spend.js";
export type EvalClock = Readonly<{
    now(): string;
}>;
export type ResolvedEvalSource = Readonly<{
    fixturePath: string | null;
    mediaType: "image/png" | "image/jpeg" | "image/webp" | null;
    digestInput: unknown;
}>;
export type EvalSourceResolver = Readonly<{
    resolve(input: Readonly<{
        caseId: string;
        source: EvalSource;
    }>): Promise<ResolvedEvalSource>;
}>;
export type PaidEvalCallRequest = Readonly<{
    caseId: string;
    sources: readonly EvalSource[];
    callId: string;
    reservationId: string;
    modelId: string;
    modelKind: "text_link" | "vision";
}>;
export type PaidEvalCallResult = Readonly<{
    outcome: "settled";
    result: Readonly<{
        kind: "success";
        observation: unknown;
    }> | Readonly<{
        kind: "failure";
        failure: SafeEvalFailure;
    }>;
    evidence: ActualChargeEvidence;
}> | Readonly<{
    outcome: "no_charge";
    failure: SafeEvalFailure;
    proof: NoChargeEvidence;
}> | Readonly<{
    outcome: "ambiguous";
    failure: SafeEvalFailure;
}>;
export type PaidEvalCallPort = Readonly<{
    call(input: PaidEvalCallRequest): Promise<PaidEvalCallResult>;
}>;
export type SpendAuthority = Readonly<{
    reserveRun(input: ReserveRunRequest): Promise<SpendReservation>;
    recordActual(input: RecordActualRequest): Promise<SpendReservation>;
    recordNoCharge(input: RecordNoChargeRequest): Promise<SpendReservation>;
    markAmbiguous(input: MarkAmbiguousRequest): Promise<SpendReservation>;
    close(input: CloseReservationRequest): Promise<SpendSnapshot>;
    inspect(key: string): Promise<SpendSnapshot>;
}>;
export type HostEvalMetadata = Readonly<{
    credentialPresent: boolean;
    models: Readonly<{
        text_link: string;
        vision: string;
    }>;
}>;
export type OfflineEvaluationInput = Readonly<{
    corpus: unknown;
    actuals: Readonly<Record<string, unknown>>;
    digest?: DigestPort;
}>;
export type OfflineEvaluationResult = Readonly<{
    mode: "offline";
    scorecards: readonly EvalCaseScorecard[];
}>;
export type LiveEvaluationInput = Readonly<{
    mode: "live";
    confirmPaid: boolean;
    corpus: unknown;
    chargeBound: unknown;
    clock: EvalClock;
    digest: DigestPort;
    sourceResolver: EvalSourceResolver | null;
    paidCallPort: PaidEvalCallPort | null;
    spendAuthority: SpendAuthority | null;
    hostMetadata: HostEvalMetadata;
}>;
export type LiveEvaluationResult = Readonly<{
    mode: "live";
    scorecards: readonly EvalCaseScorecard[];
    failures: readonly EvalCaseFailure[];
    reservation: SpendReservation;
    snapshot: SpendSnapshot | null;
}>;
export declare function runOfflineEvaluation(input: OfflineEvaluationInput): Promise<OfflineEvaluationResult>;
export declare function runLiveEvaluation(input: LiveEvaluationInput): Promise<LiveEvaluationResult>;
//# sourceMappingURL=live.d.ts.map