import type { PromotionValidationContext, PromotionValidationResult } from "./contracts.js";
/**
 * Validates a manually authored private-golden request without accepting captured output or raw
 * content.  The host persists the returned audit event with its promotion CAS.
 */
export declare function validatePromotionRequest(input: unknown, context: PromotionValidationContext): PromotionValidationResult;
//# sourceMappingURL=promotion.d.ts.map