import type { SourceHandle } from "../contracts.js";
import type { TextLinkProviderPort, VisionProviderPort } from "../provider-ports.js";
export declare const OPENROUTER_TEXT_LINK_MODEL: "deepseek/deepseek-v4-flash";
export declare const OPENROUTER_VISION_MODEL: "mistralai/mistral-small-2603";
export type ResolvedTextLinkSource = Readonly<{
    sourceId: string;
    kind: "text";
    text: string;
}> | Readonly<{
    sourceId: string;
    kind: "link";
    text: string;
    canonicalUrl: string | null;
}>;
export type ResolvedImageSource = Readonly<{
    sourceId: string;
    kind: "image";
    dataUrl: string;
}>;
export type TextLinkSourceHandle = Extract<SourceHandle, {
    kind: "text" | "link";
}>;
export type ImageSourceHandle = Extract<SourceHandle, {
    kind: "image";
}>;
export type TextLinkSourceResolver = (source: TextLinkSourceHandle) => Promise<ResolvedTextLinkSource>;
export type VisionSourceResolver = (source: ImageSourceHandle) => Promise<ResolvedImageSource>;
export type OpenRouterTransportResult = Readonly<{
    ok: true;
    body: unknown;
}> | Readonly<{
    ok: false;
    failure: "network" | "timeout" | "http";
    status: number | null;
    retryable: boolean;
}>;
export interface OpenRouterTransport {
    complete(request: OpenRouterChatRequest): Promise<OpenRouterTransportResult>;
}
export type OpenRouterChatRequest = Readonly<{
    model: typeof OPENROUTER_TEXT_LINK_MODEL | typeof OPENROUTER_VISION_MODEL;
    messages: readonly OpenRouterMessage[];
    response_format: Readonly<{
        type: "json_schema";
        json_schema: Readonly<{
            name: "event_scanner_observation";
            strict: true;
            schema: Readonly<Record<string, unknown>>;
        }>;
    }>;
    temperature: 0;
    max_completion_tokens: 8192;
    reasoning: Readonly<{
        exclude: true;
    }>;
    provider: Readonly<{
        require_parameters: true;
        data_collection: "deny";
        zdr: true;
    }>;
    stream: false;
}>;
export type OpenRouterMessage = Readonly<{
    role: "system";
    content: string;
}> | Readonly<{
    role: "user";
    content: string | readonly (Readonly<{
        type: "text";
        text: string;
    }> | Readonly<{
        type: "image_url";
        image_url: Readonly<{
            url: string;
        }>;
    }>)[];
}>;
export type ProviderAdapterErrorCode = "source_resolution_failed" | "source_identity_mismatch" | "unsupported_source_content" | "transport_failed" | "provider_refusal" | "empty_completion" | "malformed_response" | "invalid_observation" | "privacy_endpoint_unavailable";
export declare class ProviderAdapterError extends Error {
    readonly code: ProviderAdapterErrorCode;
    readonly retryable: boolean;
    readonly status: number | null;
    constructor(input: Readonly<{
        code: ProviderAdapterErrorCode;
        retryable: boolean;
        status?: number | null;
    }>);
}
export type OpenRouterTextLinkProvider = TextLinkProviderPort;
export type OpenRouterVisionProvider = VisionProviderPort;
//# sourceMappingURL=contracts.d.ts.map