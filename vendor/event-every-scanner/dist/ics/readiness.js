import { Temporal } from "@js-temporal/polyfill";
import { ISSUE_TRAITS, } from "../contracts.js";
import { deduplicateIssues, issue, sortIssues, } from "../issues.js";
import { canonicalizeRecurrence, parseRecurrence, } from "../recurrence.js";
import { resolveZonedPoint, validateTemporalClaim, } from "../temporal.js";
const OPTIONAL_OMISSIONS = [
    "title",
    "description",
    "location",
    "url",
    "recurrence",
];
const MISSING_MESSAGES = {
    title: "No title will be written to the iCalendar event.",
    description: "No description will be written to the iCalendar event.",
    location: "No location will be written to the iCalendar event.",
    url: "No URL will be written to the iCalendar event.",
    recurrence: "No recurrence will be written to the iCalendar event.",
    end: "No end or duration will be written to the iCalendar event.",
};
function scannerIssue(code, field, message, evidence = []) {
    const { kind, severity } = ISSUE_TRAITS[code];
    return issue({
        code,
        kind,
        severity,
        field,
        message,
        evidence,
    });
}
function missingWarning(field, omittedField, evidence = []) {
    return scannerIssue("field_not_found", field, MISSING_MESSAGES[omittedField], evidence);
}
function isCompleteUtcInstant(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
        return false;
    }
    try {
        Temporal.Instant.from(value);
        return true;
    }
    catch {
        return false;
    }
}
function validatePolicy(policy) {
    const issues = [];
    if (policy.uid === null ||
        policy.uid.trim().length === 0 ||
        /[\r\n]/.test(policy.uid)) {
        issues.push(scannerIssue("missing_export_uid", "candidate", "The exporter must provide an explicit non-empty iCalendar UID with no line breaks."));
    }
    if (!isCompleteUtcInstant(policy.dtstamp)) {
        issues.push(scannerIssue("invalid_dtstamp", "candidate", "DTSTAMP must be a complete UTC instant."));
    }
    if (policy.prodId.length === 0 || /[\r\n]/.test(policy.prodId)) {
        issues.push(scannerIssue("invalid_prodid", "candidate", "PRODID must be non-empty and contain no line breaks."));
    }
    return issues;
}
function resolveTemporalPoint(point, evidence) {
    if (point?.kind !== "zoned") {
        return { point, issues: [] };
    }
    return resolveZonedPoint(point, evidence);
}
function temporalReadinessIssues(claim, evidence) {
    if (claim === null) {
        return [
            scannerIssue("missing_start", "temporal", "The event start is missing.", evidence),
        ];
    }
    const start = resolveTemporalPoint(claim.start, evidence);
    const end = resolveTemporalPoint(claim.end, evidence);
    const validationIssues = validateTemporalClaim({
        ...claim,
        start: start.point,
        end: end.point,
    });
    const validationIdentifiedInvalidPoint = validationIssues.some(({ code }) => code === "invalid_date" || code === "invalid_time_zone");
    const resolutionIssues = [...start.issues, ...end.issues].filter(({ code }) => code !== "invalid_time_zone" || !validationIdentifiedInvalidPoint);
    return [
        ...validationIssues,
        ...resolutionIssues,
    ];
}
function omissionWarnings(candidate) {
    const warnings = [];
    const omittedFields = [];
    for (const field of OPTIONAL_OMISSIONS) {
        if (candidate[field].value === null) {
            omittedFields.push(field);
            warnings.push(missingWarning(field, field, candidate[field].evidence));
        }
    }
    const temporal = candidate.temporal.value;
    if (temporal !== null && temporal.end === null && temporal.duration === null) {
        omittedFields.push("end");
        warnings.push(missingWarning("temporal", "end", candidate.temporal.evidence));
    }
    return { warnings, omittedFields };
}
function urlIssues(candidate) {
    const value = candidate.url.value;
    if (value === null) {
        return [];
    }
    try {
        if (/[\r\n]/.test(value)) {
            throw new Error("URL contains a line break.");
        }
        new URL(value);
        return [];
    }
    catch {
        return [
            scannerIssue("invalid_url", "url", "The event URL must be an absolute URL with no line breaks.", candidate.url.evidence),
        ];
    }
}
function recurrenceIssues(candidate) {
    const observedIssues = candidate.issues.filter((value) => value.field === "recurrence" &&
        (value.code === "invalid_recurrence" ||
            value.code === "unsupported_recurrence"));
    const recurrence = candidate.recurrence.value;
    const start = candidate.temporal.value?.start;
    if (recurrence === null || start === null || start === undefined) {
        return observedIssues;
    }
    try {
        const canonical = canonicalizeRecurrence(recurrence);
        const revalidated = parseRecurrence({
            rrule: canonical.rrule,
            rDates: canonical.rDates,
            exDates: canonical.exDates,
            start,
        });
        return [
            ...observedIssues,
            ...revalidated.issues.map((value) => issue({
                ...value,
                evidence: candidate.recurrence.evidence,
            })),
        ];
    }
    catch {
        return [
            ...observedIssues,
            scannerIssue("invalid_recurrence", "recurrence", "The recurrence cannot be represented by the declared iCalendar subset.", candidate.recurrence.evidence),
        ];
    }
}
function splitIssues(issues) {
    const sorted = sortIssues(deduplicateIssues(issues));
    return {
        blockers: sorted.filter((value) => value.severity === "blocker"),
        warnings: sorted.filter((value) => value.severity === "warning"),
    };
}
export function validateForIcs(candidate, policy) {
    const omissions = omissionWarnings(candidate);
    const classified = splitIssues([
        ...validatePolicy(policy),
        ...temporalReadinessIssues(candidate.temporal.value, candidate.temporal.evidence),
        ...urlIssues(candidate),
        ...recurrenceIssues(candidate),
        ...omissions.warnings,
    ]);
    if (classified.blockers.length > 0) {
        return {
            canGenerate: false,
            blockers: classified.blockers,
            warnings: classified.warnings,
            omittedFields: omissions.omittedFields,
        };
    }
    return {
        canGenerate: true,
        warnings: classified.warnings,
        omittedFields: omissions.omittedFields,
    };
}
//# sourceMappingURL=readiness.js.map