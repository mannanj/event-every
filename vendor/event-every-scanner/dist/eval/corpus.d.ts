import { type EvalCase, type EvalCorpus, type EvalSource } from "./contracts.js";
export type EvalValidationCode = "eval_corpus_invalid" | "eval_case_invalid" | "eval_source_invalid" | "eval_expected_invalid" | "eval_routing_invalid" | "eval_provenance_invalid" | "eval_fixture_invalid";
export declare class EvalValidationError extends Error {
    readonly code: EvalValidationCode;
    readonly path: readonly (string | number)[];
    constructor(code: EvalValidationCode, path: readonly (string | number)[]);
}
/** Validates data only; resolving paths, symlinks, bytes, and digests is host-owned. */
export declare function validateEvalCorpus(input: unknown): EvalCorpus;
export declare function sourcesForCase(value: EvalCase): readonly EvalSource[];
//# sourceMappingURL=corpus.d.ts.map