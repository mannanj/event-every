import { type OpenRouterChatRequest, type ResolvedTextLinkSource, type ResolvedImageSource } from "./contracts.js";
/**
 * Build a non-streaming OpenRouter chat-completion request for text and link
 * sources using the fixed DeepSeek model.
 *
 * Text and link sources are rendered as JSON-stringified labeled records
 * containing only sourceId, kind, text, and canonicalUrl. No contentHandle,
 * credentials, or unacquired URLs cross the adapter boundary.
 *
 * The request uses strict JSON Schema output, privacy routing controls,
 * zero temperature, and no extensions (plugins, tools, web search, healing).
 */
export declare function buildTextLinkRequest(sources: readonly ResolvedTextLinkSource[]): OpenRouterChatRequest;
/**
 * Build a non-streaming OpenRouter chat-completion request for image sources
 * using the fixed Mistral model.
 *
 * Images are rendered as alternating text-label ("Image source <id>:") and
 * image_url (validated data URL) parts. No public URLs, contentHandle, or
 * unacquired image URLs cross the boundary.
 *
 * The request uses strict JSON Schema output, privacy routing controls,
 * zero temperature, and no extensions.
 */
export declare function buildVisionRequest(sources: readonly ResolvedImageSource[]): OpenRouterChatRequest;
//# sourceMappingURL=request.d.ts.map