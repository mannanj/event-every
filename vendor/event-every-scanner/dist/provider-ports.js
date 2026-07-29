import { ProviderScanObservationSchema, } from "./contracts.js";
import { z } from "zod";
import { createCandidate, } from "./candidate.js";
/**
 * Validates the identity relation shared by every provider port before a resolver or adapter can
 * attribute evidence.  The error deliberately names no source or handle.
 */
export function assertUniqueProviderSourceIds(sources) {
    const sourceIds = new Set();
    for (const source of sources) {
        if (sourceIds.has(source.sourceId)) {
            throw new z.ZodError([{
                    code: "custom",
                    message: "Provider source identifiers must be unique.",
                    path: ["sources"],
                }]);
        }
        sourceIds.add(source.sourceId);
    }
}
export function candidatesFromProviderObservation(observation, candidateIdFactory) {
    const parsed = ProviderScanObservationSchema.parse(observation);
    return {
        candidates: parsed.candidates.map((candidate) => createCandidate(candidate, candidateIdFactory)),
        issues: parsed.issues,
    };
}
//# sourceMappingURL=provider-ports.js.map