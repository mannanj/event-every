import { CaptureEligibilityInputSchema, } from "./contracts.js";
/**
 * Applies only the pure equality policy. Host authentication provenance is an
 * Event Every integration gate and is intentionally not established here.
 */
export function evaluateCaptureEligibility(input) {
    const parsed = CaptureEligibilityInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            kind: "invalid",
            failure: {
                code: "capture_invalid_input",
                retryable: false,
                httpStatus: 400,
            },
        };
    }
    return parsed.data.email === "test@mannan.is"
        ? { kind: "eligible" }
        : { kind: "not_eligible" };
}
//# sourceMappingURL=eligibility.js.map