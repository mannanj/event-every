/** Browser-safe deterministic JSON serializer for in-memory fingerprints. */
export declare function canonicalize(value: unknown): string;
/** Pure synchronous SHA-256 implementation; no host crypto APIs are imported. */
export declare function sha256(value: string): string;
export declare function sha256Canonical(value: unknown): string;
//# sourceMappingURL=digest.d.ts.map