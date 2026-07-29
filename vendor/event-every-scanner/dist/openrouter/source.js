import { z } from "zod";
import { ProviderAdapterError } from "./contracts.js";
const ResolvedIdentitySchema = z.object({
    sourceId: z.string().min(1),
    kind: z.string().min(1),
});
const ResolvedTextSourceSchema = z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal("text"),
    text: z.string(),
});
const ResolvedLinkSourceSchema = z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal("link"),
    text: z.string(),
    canonicalUrl: z.string().nullable(),
});
const ResolvedImageSourceSchema = z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal("image"),
    dataUrl: z.string(),
});
// Exact regex from the approved plan — allows empty base64 payload.
const DATA_URL_REGEX = /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
/**
 * Call schema.safeParse(value) inside a try/catch. If a getter, Proxy
 * trap, or other native exception escapes safeParse, return undefined
 * so the caller can produce a fixed unsupported_source_content error.
 */
function safeParseIdentity(value) {
    try {
        const result = ResolvedIdentitySchema.safeParse(value);
        return result.success ? result.data : undefined;
    }
    catch {
        return undefined;
    }
}
function safeParseTextSource(value) {
    try {
        const result = ResolvedTextSourceSchema.safeParse(value);
        return result.success ? result.data : undefined;
    }
    catch {
        return undefined;
    }
}
function safeParseLinkSource(value) {
    try {
        const result = ResolvedLinkSourceSchema.safeParse(value);
        return result.success ? result.data : undefined;
    }
    catch {
        return undefined;
    }
}
function safeParseImageSource(value) {
    try {
        const result = ResolvedImageSourceSchema.safeParse(value);
        return result.success ? result.data : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * After a kind-specific parse that produced a snapshot, verify that the
 * snapshot's sourceId and kind still match the handle. This catches
 * TOCTOU attacks where a stateful getter returns the correct identity
 * during the initial identity parse but a different value during the
 * kind-specific parse.
 */
function checkSecondIdentity(snapshot, handle) {
    if (snapshot.sourceId !== handle.sourceId || snapshot.kind !== handle.kind) {
        throw new ProviderAdapterError({
            code: "source_identity_mismatch",
            retryable: false,
        });
    }
}
function validateTextLink(resolved, handle) {
    // 1. Safe-parse identity shell
    const identity = safeParseIdentity(resolved);
    if (identity === undefined) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    // 2. Initial identity check — pure string comparison, no property access risk
    if (identity.sourceId !== handle.sourceId || identity.kind !== handle.kind) {
        throw new ProviderAdapterError({
            code: "source_identity_mismatch",
            retryable: false,
        });
    }
    // 3. Kind-specific strict parse
    if (identity.kind === "link") {
        const linkResult = safeParseLinkSource(resolved);
        if (linkResult === undefined) {
            throw new ProviderAdapterError({
                code: "unsupported_source_content",
                retryable: false,
            });
        }
        // Second identity check: the parsed snapshot must still match the handle
        checkSecondIdentity(linkResult, handle);
        // 4. Validate non-empty text
        if (linkResult.text.trim().length === 0) {
            throw new ProviderAdapterError({
                code: "unsupported_source_content",
                retryable: false,
            });
        }
        // 5. Validate canonicalUrl
        if (linkResult.canonicalUrl !== null) {
            try {
                const url = new URL(linkResult.canonicalUrl);
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    throw new ProviderAdapterError({
                        code: "unsupported_source_content",
                        retryable: false,
                    });
                }
            }
            catch (e) {
                if (e instanceof ProviderAdapterError)
                    throw e;
                throw new ProviderAdapterError({
                    code: "unsupported_source_content",
                    retryable: false,
                });
            }
        }
        return linkResult;
    }
    // text kind
    const textResult = safeParseTextSource(resolved);
    if (textResult === undefined) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    // Second identity check: the parsed snapshot must still match the handle
    checkSecondIdentity(textResult, handle);
    if (textResult.text.trim().length === 0) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    return textResult;
}
function validateImage(resolved, handle) {
    // 1. Safe-parse identity shell
    const identity = safeParseIdentity(resolved);
    if (identity === undefined) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    // 2. Initial identity check
    if (identity.sourceId !== handle.sourceId || identity.kind !== handle.kind) {
        throw new ProviderAdapterError({
            code: "source_identity_mismatch",
            retryable: false,
        });
    }
    // 3. Kind-specific strict parse
    const imageData = safeParseImageSource(resolved);
    if (imageData === undefined) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    // Second identity check: the parsed snapshot must still match the handle
    checkSecondIdentity(imageData, handle);
    // 4. Validate data URL pattern (exact regex from plan)
    if (!DATA_URL_REGEX.test(imageData.dataUrl)) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    // 5. Separate non-empty check: the substring after the comma must be non-empty
    const commaIndex = imageData.dataUrl.indexOf(",");
    const payload = commaIndex === -1 ? "" : imageData.dataUrl.slice(commaIndex + 1);
    if (payload.length === 0) {
        throw new ProviderAdapterError({
            code: "unsupported_source_content",
            retryable: false,
        });
    }
    return imageData;
}
export async function resolveTextLinkSources(handles, resolver) {
    return Promise.all(handles.map(async (handle) => {
        let resolved;
        try {
            resolved = await resolver(handle);
        }
        catch {
            throw new ProviderAdapterError({
                code: "source_resolution_failed",
                retryable: false,
            });
        }
        return validateTextLink(resolved, handle);
    }));
}
export async function resolveImageSources(handles, resolver) {
    return Promise.all(handles.map(async (handle) => {
        let resolved;
        try {
            resolved = await resolver(handle);
        }
        catch {
            throw new ProviderAdapterError({
                code: "source_resolution_failed",
                retryable: false,
            });
        }
        return validateImage(resolved, handle);
    }));
}
//# sourceMappingURL=source.js.map