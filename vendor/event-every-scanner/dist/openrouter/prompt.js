/**
 * Fixed extraction system prompt for Event Scanner OpenRouter requests.
 *
 * Every invariant is spelled out explicitly. No ad hoc field descriptions —
 * the generated Zod JSON Schema is the sole structural authority.
 */
export const SYSTEM_PROMPT = [
    "Return one ordered candidate for each event found, preserving source order.",
    "Keep same-looking sibling events independent; never merge, deduplicate, rank, or suppress them.",
    "Return the complete null-bearing Event Scanner field shape for every candidate.",
    "Use null when a fact was not found.",
    "Never invent a year, timezone, UTC offset, end, duration, source UID, or recurrence.",
    "Preserve partial, ambiguous, conflicting, invalid, and unsupported claims with issues.",
    "Use only source IDs and evidence supplied in this request.",
    "Evidence excerpts are at most 240 characters.",
    "Text offsets are ordered zero-based character offsets into the labeled resolved text.",
    "Image evidence uses null text offsets.",
    "Do not return raw source payloads, provider metadata, markdown, or commentary.",
].join("\n");
//# sourceMappingURL=prompt.js.map