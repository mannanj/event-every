import type { ProviderScanObservation } from "../contracts.js";
import { type OpenRouterChatRequest, type OpenRouterTransport, type ResolvedImageSource, type ResolvedTextLinkSource } from "./contracts.js";
type ResolvedSource = ResolvedTextLinkSource | ResolvedImageSource;
/**
 * Complete one fixed-model OpenRouter request and convert its first completion
 * to the validated runtime observation. This is the boundary where every
 * transport, JSON, and schema failure becomes a sanitized adapter error.
 */
export declare function completeObservation(input: Readonly<{
    transport: OpenRouterTransport;
    request: OpenRouterChatRequest;
    sources: readonly ResolvedSource[];
}>): Promise<ProviderScanObservation>;
export {};
//# sourceMappingURL=response.d.ts.map