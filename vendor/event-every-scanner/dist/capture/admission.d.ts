import type { CapturedAdmissionInput, CapturedAdmissionResult } from "./contracts.js";
type AdmissionPorts = Readonly<{
    capture: import("./contracts.js").PrivateCaptureStore;
    provider: import("./contracts.js").CapturedProviderPort;
}>;
/**
 * Admits at most one provider call for a durably prepared, immutable capture receipt.
 * Host ports own storage, time, transport, and all source content resolution.
 */
export declare function runCapturedAdmission(input: CapturedAdmissionInput, ports: AdmissionPorts): Promise<CapturedAdmissionResult>;
export {};
//# sourceMappingURL=admission.d.ts.map