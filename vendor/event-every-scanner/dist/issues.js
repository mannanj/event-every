import { ScannerIssueSchema, } from "./contracts.js";
const FIELD_ORDER = {
    sourceUid: 0,
    title: 1,
    description: 2,
    location: 3,
    url: 4,
    temporal: 5,
    recurrence: 6,
    candidate: 7,
    scan: 8,
};
const MISSING_MESSAGES = {
    title: "No title was found.",
    description: "No description was found.",
    location: "No location was found.",
    url: "No URL was found.",
    temporal: "No temporal information was found.",
    recurrence: "No recurrence was found.",
};
const CLAIM_FIELDS = [
    "title",
    "description",
    "location",
    "url",
    "temporal",
    "recurrence",
];
export function issue(input) {
    return ScannerIssueSchema.parse(input);
}
export function sortIssues(issues) {
    return [...issues].sort((left, right) => {
        const fieldDifference = FIELD_ORDER[left.field] - FIELD_ORDER[right.field];
        if (fieldDifference !== 0) {
            return fieldDifference;
        }
        const severityDifference = (left.severity === "blocker" ? 0 : 1) -
            (right.severity === "blocker" ? 0 : 1);
        if (severityDifference !== 0) {
            return severityDifference;
        }
        return left.code.localeCompare(right.code);
    });
}
function issueKey(value) {
    return JSON.stringify([
        value.code,
        value.kind,
        value.severity,
        value.field,
        value.message,
        value.evidence,
    ]);
}
export function deduplicateIssues(issues) {
    const seen = new Set();
    return issues.filter((value) => {
        const key = issueKey(value);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
export function issuesForMissingClaims(observation) {
    return CLAIM_FIELDS.flatMap((field) => {
        if (observation[field].value !== null) {
            return [];
        }
        const alreadyExplained = observation.issues.some((value) => value.field === field &&
            [
                "not_found",
                "incomplete",
                "ambiguous",
                "conflicting",
            ].includes(value.kind));
        if (alreadyExplained) {
            return [];
        }
        return [
            issue({
                code: "field_not_found",
                kind: "not_found",
                severity: "warning",
                field,
                message: MISSING_MESSAGES[field],
                evidence: observation[field].evidence,
            }),
        ];
    });
}
//# sourceMappingURL=issues.js.map