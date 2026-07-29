import { ProviderScanObservationSchema } from "../contracts.js";
import { canonicalize, sha256Canonical } from "./digest.js";
const candidateFields = ["sourceUid", "title", "description", "location", "url", "temporal", "recurrence"];
function equal(left, right) { return canonicalize(left) === canonicalize(right); }
function add(violations, code, state, candidateIndex, issueIndex, evidenceIndex, fieldPath) { violations.push({ code, state, candidateIndex, issueIndex, evidenceIndex, fieldPath }); }
function multiset(values, digest) { return values.map(digest).sort(); }
function permutation(expected, actual, digest) { return expected.length === actual.length && !equal(expected, actual) && equal(multiset(expected, digest), multiset(actual, digest)); }
export function scoreCase(caseData, actualInput, digest = sha256Canonical) {
    const expected = ProviderScanObservationSchema.parse(caseData.expected);
    const parsedActual = ProviderScanObservationSchema.safeParse(actualInput);
    const violations = [];
    const fields = { exactValues: 0, exactNulls: 0, missingValues: 0, fabricatedValues: 0, mismatchedValues: 0 };
    const issues = { exact: 0, missing: 0, extra: 0, reordered: 0 };
    const evidence = { exact: 0, missing: 0, extra: 0, invalidSource: 0 };
    if (!parsedActual.success) {
        add(violations, "schema_invalid_actual", "invalid", null, null, null, null);
        return { caseId: caseData.caseId, valid: false, exact: false, candidateCount: { expected: expected.candidates.length, actual: 0, matched: 0, missing: expected.candidates.length, extra: 0 }, fields, issues, evidence, violations };
    }
    const actual = parsedActual.data;
    const count = { expected: expected.candidates.length, actual: actual.candidates.length, matched: Math.min(expected.candidates.length, actual.candidates.length), missing: Math.max(0, expected.candidates.length - actual.candidates.length), extra: Math.max(0, actual.candidates.length - expected.candidates.length) };
    if (count.missing > 0)
        add(violations, "candidate_count_mismatch", "missing", null, null, null, "candidates");
    if (count.extra > 0)
        add(violations, "candidate_count_mismatch", "extra", null, null, null, "candidates");
    if (permutation(expected.candidates, actual.candidates, digest))
        add(violations, "candidate_reordered", "reordered", null, null, null, "candidates");
    const sourceIds = new Set(caseData.sources.map((source) => source.sourceId));
    validateActualEvidence(actual, sourceIds, evidence, violations);
    for (let index = 0; index < count.matched; index += 1)
        compareCandidate(expected.candidates[index], actual.candidates[index], index, sourceIds, fields, issues, evidence, violations, digest);
    compareIssues(expected.issues, actual.issues, null, sourceIds, issues, evidence, violations, digest, "issues");
    return { caseId: caseData.caseId, valid: true, exact: violations.length === 0, candidateCount: count, fields, issues, evidence, violations };
}
function validateEvidenceSources(values, candidateIndex, issueIndex, path, sourceIds, evidence, violations) {
    for (let index = 0; index < values.length; index += 1) {
        if (!sourceIds.has(values[index].sourceId)) {
            evidence.invalidSource += 1;
            add(violations, "evidence_unknown_source", "invalid", candidateIndex, issueIndex, index, `${path}.${index}.sourceId`);
        }
    }
}
function validateActualEvidence(actual, sourceIds, evidence, violations) {
    for (let candidateIndex = 0; candidateIndex < actual.candidates.length; candidateIndex += 1) {
        const candidate = actual.candidates[candidateIndex];
        for (const field of candidateFields)
            if (field !== "sourceUid")
                validateEvidenceSources(candidate[field].evidence, candidateIndex, null, `candidates.${candidateIndex}.${field}`, sourceIds, evidence, violations);
        for (let issueIndex = 0; issueIndex < candidate.issues.length; issueIndex += 1)
            validateEvidenceSources(candidate.issues[issueIndex].evidence, candidateIndex, issueIndex, `candidates.${candidateIndex}.issues.${issueIndex}.evidence`, sourceIds, evidence, violations);
    }
    for (let issueIndex = 0; issueIndex < actual.issues.length; issueIndex += 1)
        validateEvidenceSources(actual.issues[issueIndex].evidence, null, issueIndex, `issues.${issueIndex}.evidence`, sourceIds, evidence, violations);
}
function compareCandidate(expected, actual, index, sourceIds, fields, issues, evidence, violations, digest) {
    for (const field of candidateFields)
        compareField(expected, actual, field, index, sourceIds, fields, evidence, violations, digest);
    compareIssues(expected.issues, actual.issues, index, sourceIds, issues, evidence, violations, digest, `candidates.${index}.issues`);
}
function compareField(expected, actual, field, candidateIndex, sourceIds, fields, evidence, violations, digest) {
    const path = `candidates.${candidateIndex}.${field}`;
    if (field === "sourceUid") {
        const expectedValue = expected[field];
        const actualValue = actual[field];
        if (expectedValue === null && actualValue === null)
            fields.exactNulls += 1;
        else if (expectedValue !== null && actualValue === null) {
            fields.missingValues += 1;
            add(violations, "field_missing", "missing", candidateIndex, null, null, path);
        }
        else if (expectedValue === null && actualValue !== null) {
            fields.fabricatedValues += 1;
            add(violations, "field_fabricated", "extra", candidateIndex, null, null, path);
        }
        else if (expectedValue === actualValue)
            fields.exactValues += 1;
        else {
            fields.mismatchedValues += 1;
            add(violations, "field_mismatch", "mismatch", candidateIndex, null, null, path);
        }
        return;
    }
    const expectedField = expected[field];
    const actualField = actual[field];
    if (expectedField.value === null && actualField.value === null)
        fields.exactNulls += 1;
    else if (expectedField.value !== null && actualField.value === null) {
        fields.missingValues += 1;
        add(violations, "field_missing", "missing", candidateIndex, null, null, path);
    }
    else if (expectedField.value === null && actualField.value !== null) {
        fields.fabricatedValues += 1;
        add(violations, "field_fabricated", "extra", candidateIndex, null, null, path);
    }
    else if (equal(expectedField.value, actualField.value))
        fields.exactValues += 1;
    else {
        fields.mismatchedValues += 1;
        add(violations, "field_mismatch", "mismatch", candidateIndex, null, null, path);
    }
    if (expectedField.confidence !== actualField.confidence) {
        fields.mismatchedValues += 1;
        add(violations, "field_mismatch", "mismatch", candidateIndex, null, null, `${path}.confidence`);
    }
    compareEvidence(expectedField.evidence, actualField.evidence, candidateIndex, null, path, sourceIds, evidence, violations, digest);
}
function compareIssues(expected, actual, candidateIndex, sourceIds, issues, evidence, violations, digest, path) {
    const paired = Math.min(expected.length, actual.length);
    for (let index = 0; index < paired; index += 1) {
        if (equal(issueIdentity(expected[index]), issueIdentity(actual[index])))
            issues.exact += 1;
        else
            add(violations, "issue_reordered", "mismatch", candidateIndex, index, null, `${path}.${index}`);
        compareEvidence(expected[index].evidence, actual[index].evidence, candidateIndex, index, `${path}.${index}.evidence`, sourceIds, evidence, violations, digest);
    }
    if (expected.length > actual.length) {
        issues.missing += expected.length - actual.length;
        add(violations, "issue_missing", "missing", candidateIndex, null, null, path);
    }
    if (actual.length > expected.length) {
        issues.extra += actual.length - expected.length;
        add(violations, "issue_extra", "extra", candidateIndex, null, null, path);
    }
    if (permutation(expected.map(issueIdentity), actual.map(issueIdentity), digest)) {
        issues.reordered += 1;
        add(violations, "issue_reordered", "reordered", candidateIndex, null, null, path);
    }
}
function issueIdentity(issue) {
    return { code: issue.code, kind: issue.kind, severity: issue.severity, field: issue.field };
}
function compareEvidence(expected, actual, candidateIndex, issueIndex, path, sourceIds, evidence, violations, digest) {
    const paired = Math.min(expected.length, actual.length);
    for (let index = 0; index < paired; index += 1) {
        if (equal(expected[index], actual[index]))
            evidence.exact += 1;
        else
            add(violations, "evidence_reordered", "mismatch", candidateIndex, issueIndex, index, `${path}.${index}`);
    }
    if (expected.length > actual.length) {
        evidence.missing += expected.length - actual.length;
        add(violations, "evidence_missing", "missing", candidateIndex, issueIndex, null, path);
    }
    if (actual.length > expected.length) {
        evidence.extra += actual.length - expected.length;
        add(violations, "evidence_extra", "extra", candidateIndex, issueIndex, null, path);
    }
    if (permutation(expected, actual, digest))
        add(violations, "evidence_reordered", "reordered", candidateIndex, issueIndex, null, path);
}
//# sourceMappingURL=score.js.map