import { assertUniqueProviderSourceIds } from "../provider-ports.js";
import { ProviderAdapterError } from "./contracts.js";
import { buildTextLinkRequest, buildVisionRequest } from "./request.js";
import { completeObservation } from "./response.js";
import { resolveImageSources, resolveTextLinkSources } from "./source.js";
export function createOpenRouterTextLinkProvider(input) {
    return {
        async scan(sources) {
            try {
                assertUniqueProviderSourceIds(sources);
            }
            catch {
                throw new ProviderAdapterError({ code: "source_identity_mismatch", retryable: false });
            }
            if (sources.length === 0) {
                return { candidates: [], issues: [] };
            }
            const resolved = await resolveTextLinkSources(sources, input.resolve);
            return completeObservation({
                transport: input.transport,
                request: buildTextLinkRequest(resolved),
                sources: resolved,
            });
        },
    };
}
export function createOpenRouterVisionProvider(input) {
    return {
        async scan(sources) {
            try {
                assertUniqueProviderSourceIds(sources);
            }
            catch {
                throw new ProviderAdapterError({ code: "source_identity_mismatch", retryable: false });
            }
            if (sources.length === 0) {
                return { candidates: [], issues: [] };
            }
            const resolved = await resolveImageSources(sources, input.resolve);
            return completeObservation({
                transport: input.transport,
                request: buildVisionRequest(resolved),
                sources: resolved,
            });
        },
    };
}
//# sourceMappingURL=adapter.js.map