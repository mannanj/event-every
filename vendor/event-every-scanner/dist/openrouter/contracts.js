export const OPENROUTER_TEXT_LINK_MODEL = "deepseek/deepseek-v4-flash";
export const OPENROUTER_VISION_MODEL = "mistralai/mistral-small-2603";
const PROVIDER_ADAPTER_MESSAGES = {
    source_resolution_failed: "The source could not be resolved.",
    source_identity_mismatch: "The resolved source did not match its handle.",
    unsupported_source_content: "The resolved source content is unsupported.",
    transport_failed: "The provider request failed.",
    provider_refusal: "The provider refused the request.",
    empty_completion: "The provider returned no completion.",
    malformed_response: "The provider returned an invalid response.",
    invalid_observation: "The provider returned an invalid observation.",
    privacy_endpoint_unavailable: "No privacy-compatible model endpoint is available.",
};
const ALLOWED_OWN_KEYS = [
    "code",
    "message",
    "name",
    "retryable",
    "status",
];
export class ProviderAdapterError extends Error {
    code;
    retryable;
    status;
    constructor(input) {
        super(PROVIDER_ADAPTER_MESSAGES[input.code]);
        this.name = "ProviderAdapterError";
        this.code = input.code;
        this.retryable = input.retryable;
        this.status = input.status ?? null;
        delete this.stack;
        // Strip every own property not in the allowlist
        for (const key of Object.getOwnPropertyNames(this)) {
            if (!ALLOWED_OWN_KEYS.includes(key)) {
                Reflect.deleteProperty(this, key);
            }
        }
    }
}
//# sourceMappingURL=contracts.js.map