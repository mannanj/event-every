import { OPENROUTER_TEXT_LINK_MODEL, OPENROUTER_VISION_MODEL, } from "./contracts.js";
import { OPENROUTER_OBSERVATION_JSON_SCHEMA } from "./wire-schema.js";
import { SYSTEM_PROMPT } from "./prompt.js";
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
export function buildTextLinkRequest(sources) {
    // Render each source as a plain object with only the approved fields
    const rendered = sources.map((s) => {
        if (s.kind === "link") {
            return {
                sourceId: s.sourceId,
                kind: s.kind,
                text: s.text,
                canonicalUrl: s.canonicalUrl,
            };
        }
        return {
            sourceId: s.sourceId,
            kind: s.kind,
            text: s.text,
        };
    });
    return {
        model: OPENROUTER_TEXT_LINK_MODEL,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(rendered) },
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "event_scanner_observation",
                strict: true,
                schema: OPENROUTER_OBSERVATION_JSON_SCHEMA,
            },
        },
        temperature: 0,
        max_completion_tokens: 8192,
        reasoning: { exclude: true },
        provider: {
            require_parameters: true,
            data_collection: "deny",
            zdr: true,
        },
        stream: false,
    };
}
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
export function buildVisionRequest(sources) {
    const parts = [];
    for (const s of sources) {
        parts.push({ type: "text", text: `Image source ${s.sourceId}:` });
        parts.push({ type: "image_url", image_url: { url: s.dataUrl } });
    }
    return {
        model: OPENROUTER_VISION_MODEL,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: parts },
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "event_scanner_observation",
                strict: true,
                schema: OPENROUTER_OBSERVATION_JSON_SCHEMA,
            },
        },
        temperature: 0,
        max_completion_tokens: 8192,
        reasoning: { exclude: true },
        provider: {
            require_parameters: true,
            data_collection: "deny",
            zdr: true,
        },
        stream: false,
    };
}
//# sourceMappingURL=request.js.map