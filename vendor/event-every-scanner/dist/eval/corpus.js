import { EvalCorpusSchema } from "./contracts.js";
export class EvalValidationError extends Error {
    code;
    path;
    constructor(code, path) {
        super(code);
        this.code = code;
        this.path = path;
        this.name = "EvalValidationError";
    }
}
function invalid(code, path) {
    throw new EvalValidationError(code, path);
}
function stableCode(issue) {
    if (["eval_case_invalid", "eval_source_invalid", "eval_expected_invalid", "eval_routing_invalid", "eval_fixture_invalid"].includes(issue.message))
        return issue.message;
    if (issue.path.includes("provenance"))
        return "eval_provenance_invalid";
    if (issue.path.includes("expected"))
        return "eval_expected_invalid";
    if (issue.path.includes("fixturePath") || issue.path.includes("fixtureSha256") || issue.path.includes("mediaType"))
        return "eval_fixture_invalid";
    if (issue.path.includes("sources"))
        return "eval_source_invalid";
    if (issue.path.includes("cases"))
        return "eval_case_invalid";
    return "eval_corpus_invalid";
}
/** Validates data only; resolving paths, symlinks, bytes, and digests is host-owned. */
export function validateEvalCorpus(input) {
    const parsed = EvalCorpusSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        invalid(stableCode(issue ?? { message: "", path: [] }), (issue?.path ?? []).map((part) => typeof part === "number" ? part : String(part)));
    }
    return parsed.data;
}
export function sourcesForCase(value) {
    return value.sources;
}
//# sourceMappingURL=corpus.js.map