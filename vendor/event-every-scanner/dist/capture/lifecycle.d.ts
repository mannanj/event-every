import type { CaptureActionAuthorization, CaptureTransitionResult, GoldenTransitionResult, PromotionValidationContext, ReviewedCapturePromotionResult } from "./contracts.js";
/**
 * Pure lifecycle policy. The returned audit event is part of the CAS result: hosts must persist it
 * in the same transaction as a successful state change. This function never performs persistence,
 * cleanup, or clock access.
 */
export declare function applyCaptureTransition(currentInput: unknown, requestInput: unknown, now: string): CaptureTransitionResult;
/** Pure golden lifecycle policy; hosts persist the returned audit event atomically with their CAS. */
export declare function applyGoldenTransition(currentInput: unknown, requestInput: unknown, now: string): GoldenTransitionResult;
/**
 * Computes the one auditable reviewed-capture → active-golden promotion.  The returned result is
 * intentionally paired: a host cannot use it to create a golden without also advancing the
 * reviewed capture, and the golden ciphertext is owned only by the golden lifecycle.
 */
export declare function applyReviewedCapturePromotion(captureInput: unknown, goldenInput: unknown, requestInput: unknown, context: PromotionValidationContext): ReviewedCapturePromotionResult;
/**
 * Returns the required audit event for a privileged action. Hosts must append it before returning
 * private data for list/decrypt, and must append it atomically with every state-changing CAS.
 */
export declare function authorizeCaptureAction(input: unknown): CaptureActionAuthorization;
//# sourceMappingURL=lifecycle.d.ts.map