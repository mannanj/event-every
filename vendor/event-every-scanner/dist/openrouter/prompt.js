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
    "Evidence is the source ID and a short excerpt of at most 240 characters; cite no positions or locators.",
    "A zoned time is the local date, time, and IANA zone the source states, plus the UTC offset only if the source prints one.",
    "Do not return raw source payloads, provider metadata, markdown, or commentary.",
].join("\n");
//# sourceMappingURL=prompt.js.map