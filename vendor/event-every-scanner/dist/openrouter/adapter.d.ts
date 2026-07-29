import type { TextLinkProviderPort, VisionProviderPort } from "../provider-ports.js";
import type { OpenRouterTransport, TextLinkSourceResolver, VisionSourceResolver } from "./contracts.js";
export declare function createOpenRouterTextLinkProvider(input: Readonly<{
    transport: OpenRouterTransport;
    resolve: TextLinkSourceResolver;
}>): TextLinkProviderPort;
export declare function createOpenRouterVisionProvider(input: Readonly<{
    transport: OpenRouterTransport;
    resolve: VisionSourceResolver;
}>): VisionProviderPort;
//# sourceMappingURL=adapter.d.ts.map