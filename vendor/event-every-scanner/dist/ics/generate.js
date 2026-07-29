import { validateForIcs, } from "./readiness.js";
import { serializeIcs } from "./serialize.js";
export function generateIcs(candidate, policy) {
    const readiness = validateForIcs(candidate, policy);
    if (!readiness.canGenerate) {
        return {
            ok: false,
            blockers: readiness.blockers,
            warnings: readiness.warnings,
            omittedFields: readiness.omittedFields,
        };
    }
    return {
        ok: true,
        calendarText: serializeIcs(candidate, policy),
        warnings: readiness.warnings,
        omittedFields: readiness.omittedFields,
    };
}
//# sourceMappingURL=generate.js.map