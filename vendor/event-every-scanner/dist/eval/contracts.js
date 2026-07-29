import { z } from "zod";
import { ProviderScanObservationSchema } from "../contracts.js";
const SchemaVersion = z.literal(1);
const NonEmpty = z.string().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const BoundedText = z.string().min(1).max(8_192);
function addInvariantIssue(context, path, code) {
    context.addIssue({ code: "custom", path: [...path], message: code });
}
function safeFixturePath(path) {
    return !path.includes("\0") && !path.includes("\\") && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
function httpsUrl(value) {
    try {
        return new URL(value).protocol === "https:";
    }
    catch {
        return false;
    }
}
export const EvalProvenanceSchema = z.discriminatedUnion("origin", [
    z.strictObject({ origin: z.literal("synthetic"), generator: NonEmpty }),
    z.strictObject({ origin: z.literal("public_domain"), sourceUrl: z.string().refine(httpsUrl), license: NonEmpty }),
]).readonly();
export const EvalSourceSchema = z.discriminatedUnion("kind", [
    z.strictObject({ sourceId: NonEmpty, kind: z.literal("text"), text: BoundedText, provenance: EvalProvenanceSchema }),
    z.strictObject({ sourceId: NonEmpty, kind: z.literal("link"), text: BoundedText, canonicalUrl: z.string().refine(httpsUrl).nullable(), provenance: EvalProvenanceSchema }),
    z.strictObject({ sourceId: NonEmpty, kind: z.literal("image"), fixturePath: NonEmpty, mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]), fixtureSha256: Sha256, provenance: EvalProvenanceSchema }),
]).readonly();
const EvalCaseBaseSchema = z.strictObject({
    schemaVersion: SchemaVersion,
    caseId: NonEmpty.regex(/^[a-z0-9][a-z0-9_-]*$/),
    description: NonEmpty,
    kind: z.enum(["text_link", "vision"]),
    sources: z.array(EvalSourceSchema).min(1).readonly(),
    expected: ProviderScanObservationSchema,
    tags: z.array(NonEmpty).min(1).readonly(),
});
function evidenceSourceIds(expected) {
    const sourceIds = [];
    for (const candidate of expected.candidates) {
        for (const field of [candidate.title, candidate.description, candidate.location, candidate.url, candidate.temporal, candidate.recurrence]) {
            sourceIds.push(...field.evidence.map((evidence) => evidence.sourceId));
        }
        for (const issue of candidate.issues)
            sourceIds.push(...issue.evidence.map((evidence) => evidence.sourceId));
    }
    for (const issue of expected.issues)
        sourceIds.push(...issue.evidence.map((evidence) => evidence.sourceId));
    return sourceIds;
}
export const EvalCaseSchema = EvalCaseBaseSchema.superRefine((value, context) => {
    const sourceIds = new Set();
    for (let index = 0; index < value.sources.length; index += 1) {
        const source = value.sources[index];
        if (sourceIds.has(source.sourceId))
            addInvariantIssue(context, ["sources", index, "sourceId"], "eval_source_invalid");
        sourceIds.add(source.sourceId);
        if (source.kind === "image" && !safeFixturePath(source.fixturePath))
            addInvariantIssue(context, ["sources", index, "fixturePath"], "eval_fixture_invalid");
    }
    const allowedKinds = value.kind === "text_link" ? new Set(["text", "link"]) : new Set(["image"]);
    if (value.sources.some((source) => !allowedKinds.has(source.kind)))
        addInvariantIssue(context, ["sources"], "eval_routing_invalid");
    if (evidenceSourceIds(value.expected).some((sourceId) => !sourceIds.has(sourceId)))
        addInvariantIssue(context, ["expected"], "eval_expected_invalid");
}).readonly();
const EvalCorpusBaseSchema = z.strictObject({
    schemaVersion: SchemaVersion,
    corpusId: NonEmpty,
    corpusVersion: NonEmpty,
    cases: z.array(EvalCaseSchema).min(1).readonly(),
});
export const EvalCorpusSchema = EvalCorpusBaseSchema.superRefine((value, context) => {
    const caseIds = new Set();
    for (let index = 0; index < value.cases.length; index += 1) {
        const caseId = value.cases[index].caseId;
        if (caseIds.has(caseId))
            addInvariantIssue(context, ["cases", index, "caseId"], "eval_case_invalid");
        caseIds.add(caseId);
    }
}).readonly();
//# sourceMappingURL=contracts.js.map