import { z } from "zod";
import { ProviderAdapterError, } from "./contracts.js";
import { observationFromWire } from "./wire-schema.js";
const TransportResultSchema = z.discriminatedUnion("ok", [
    z.strictObject({
        ok: z.literal(true),
        body: z.unknown(),
    }),
    z.strictObject({
        ok: z.literal(false),
        failure: z.enum(["network", "timeout", "http"]),
        status: z.number().int().min(100).max(599).nullable(),
        retryable: z.boolean(),
    }),
]);
const CompletionEnvelopeSchema = z.object({
    choices: z.array(z.object({
        finish_reason: z.string(),
        message: z.object({
            content: z.string().nullable(),
            refusal: z.string().nullable().optional(),
        }),
    })).min(1),
});
function adapterError(code, retryable, status = null) {
    return new ProviderAdapterError({ code, retryable, status });
}
/**
 * Complete one fixed-model OpenRouter request and convert its first completion
 * to the validated runtime observation. This is the boundary where every
 * transport, JSON, and schema failure becomes a sanitized adapter error.
 */
export async function completeObservation(input) {
    let transportResult;
    try {
        transportResult = await input.transport.complete(input.request);
    }
    catch {
        throw adapterError("transport_failed", true);
    }
    let parsedTransport;
    try {
        parsedTransport = TransportResultSchema.safeParse(transportResult);
    }
    catch {
        throw adapterError("transport_failed", false);
    }
    if (!parsedTransport.success) {
        throw adapterError("transport_failed", false);
    }
    const result = parsedTransport.data;
    if (!result.ok) {
        if (result.failure === "http" && result.status === 503) {
            throw adapterError("privacy_endpoint_unavailable", result.retryable, result.status);
        }
        throw adapterError("transport_failed", result.retryable, result.status);
    }
    let parsedEnvelope;
    try {
        parsedEnvelope = CompletionEnvelopeSchema.safeParse(result.body);
    }
    catch {
        throw adapterError("malformed_response", false);
    }
    if (!parsedEnvelope.success) {
        throw adapterError("malformed_response", false);
    }
    const firstChoice = parsedEnvelope.data.choices[0];
    if (firstChoice === undefined) {
        throw adapterError("malformed_response", false);
    }
    if (firstChoice.message.refusal !== undefined && firstChoice.message.refusal !== null) {
        throw adapterError("provider_refusal", false);
    }
    const content = firstChoice.message.content;
    if (content === null || content.trim().length === 0) {
        throw adapterError("empty_completion", true);
    }
    if (firstChoice.finish_reason !== "stop") {
        throw adapterError("malformed_response", false);
    }
    let wire;
    try {
        wire = JSON.parse(content);
    }
    catch {
        throw adapterError("malformed_response", false);
    }
    try {
        return observationFromWire(wire, input.sources);
    }
    catch {
        throw adapterError("invalid_observation", false);
    }
}
//# sourceMappingURL=response.js.map