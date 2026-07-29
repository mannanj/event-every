import ICAL from "ical.js";
import { ISSUE_TRAITS, } from "../contracts.js";
import { createCandidate, } from "../candidate.js";
import { issue, sortIssues } from "../issues.js";
import { parseRecurrence } from "../recurrence.js";
import { validateTemporalClaim } from "../temporal.js";
function boundedExcerpt(value) {
    return [...value].slice(0, 240).join("");
}
function evidence(sourceId, locator, excerpt) {
    return {
        sourceId,
        locator,
        excerpt: boundedExcerpt(excerpt),
        startOffset: null,
        endOffset: null,
    };
}
function propertyEvidence(property, sourceId, eventIndex) {
    return evidence(sourceId, `VEVENT[${eventIndex}].${property.name.toUpperCase()}`, property.toICALString());
}
function scannerIssue(code, field, message, evidenceRefs) {
    const { kind, severity } = ISSUE_TRAITS[code];
    return issue({
        code,
        kind,
        severity,
        field,
        message,
        evidence: evidenceRefs,
    });
}
function stringClaim(component, name, sourceId, eventIndex) {
    const property = component.getFirstProperty(name);
    const value = property?.getFirstValue();
    return {
        value: typeof value === "string" ? value : null,
        confidence: null,
        evidence: property === null
            ? []
            : [propertyEvidence(property, sourceId, eventIndex)],
    };
}
function mapTime(property, timeValue) {
    const value = timeValue ?? property?.getFirstValue();
    if (!(value instanceof ICAL.Time)) {
        return null;
    }
    if (value.isDate) {
        return {
            kind: "date",
            year: value.year > 0 ? value.year : null,
            month: value.month,
            day: value.day,
        };
    }
    if (value.year <= 0) {
        return {
            kind: "partial",
            year: null,
            month: value.month,
            day: value.day,
            hour: value.hour,
            minute: value.minute,
            second: value.second,
        };
    }
    const date = {
        year: value.year,
        month: value.month,
        day: value.day,
    };
    const time = {
        hour: value.hour,
        minute: value.minute,
        second: value.second,
    };
    const timeZone = property?.getFirstParameter("tzid");
    const isUtc = value.toICALString().endsWith("Z");
    if (isUtc) {
        return {
            kind: "zoned",
            date,
            time,
            timeZone: "UTC",
            resolution: "offset_resolved",
            possibleOffsets: ["+00:00"],
            sourceOffset: "+00:00",
            chosenOffset: "+00:00",
        };
    }
    if (timeZone !== undefined && timeZone.length > 0) {
        return {
            kind: "zoned",
            date,
            time,
            timeZone,
            resolution: "exact",
            possibleOffsets: [],
            sourceOffset: null,
            chosenOffset: null,
        };
    }
    return { kind: "floating", date, time };
}
function temporalObservation(component, sourceId, eventIndex) {
    const startProperty = component.getFirstProperty("dtstart");
    const endProperty = component.getFirstProperty("dtend");
    const durationProperty = component.getFirstProperty("duration");
    const start = mapTime(startProperty);
    const end = mapTime(endProperty);
    const durationValue = durationProperty?.getFirstValue();
    const duration = durationValue instanceof ICAL.Duration
        ? durationValue.toICALString()
        : null;
    const allDay = start?.kind === "date"
        ? true
        : start === null
            ? end?.kind === "date"
                ? true
                : end === null
                    ? "unknown"
                    : false
            : false;
    const value = {
        start,
        end,
        duration,
        allDay,
    };
    const properties = [
        startProperty,
        endProperty,
        durationProperty,
    ].filter((property) => property !== null);
    return {
        claim: {
            value,
            confidence: null,
            evidence: properties.map((property) => propertyEvidence(property, sourceId, eventIndex)),
        },
        issues: validateTemporalClaim(value),
    };
}
function recurrenceObservation(component, start, sourceId, eventIndex) {
    const ruleProperty = component.getFirstProperty("rrule");
    const rDateProperties = component.getAllProperties("rdate");
    const exDateProperties = component.getAllProperties("exdate");
    const properties = [
        ...(ruleProperty === null ? [] : [ruleProperty]),
        ...rDateProperties,
        ...exDateProperties,
    ];
    const evidenceRefs = properties.map((property) => propertyEvidence(property, sourceId, eventIndex));
    if (ruleProperty === null) {
        return {
            claim: { value: null, confidence: null, evidence: evidenceRefs },
            issues: [],
        };
    }
    if (start === null) {
        return {
            claim: { value: null, confidence: null, evidence: evidenceRefs },
            issues: [
                scannerIssue("invalid_recurrence", "recurrence", "Recurrence requires a DTSTART value.", evidenceRefs),
            ],
        };
    }
    const hasUnsupportedRDate = rDateProperties.some((property) => property.getValues().some((value) => !(value instanceof ICAL.Time)));
    if (hasUnsupportedRDate) {
        return {
            claim: { value: null, confidence: null, evidence: evidenceRefs },
            issues: [
                scannerIssue("unsupported_recurrence", "recurrence", "RDATE PERIOD values are not supported in Packet 1.", evidenceRefs),
            ],
        };
    }
    const ruleLine = ruleProperty.toICALString();
    const ruleSeparator = ruleLine.indexOf(":");
    const ruleValue = ruleLine.slice(ruleSeparator + 1);
    const parsed = parseRecurrence({
        rrule: ruleValue,
        rDates: rDateProperties.flatMap((property) => property
            .getValues()
            .filter((value) => value instanceof ICAL.Time)
            .map((value) => mapTime(property, value))
            .filter((value) => value !== null)),
        exDates: exDateProperties.flatMap((property) => property
            .getValues()
            .filter((value) => value instanceof ICAL.Time)
            .map((value) => mapTime(property, value))
            .filter((value) => value !== null)),
        start,
    });
    return {
        claim: {
            value: parsed.recurrence,
            confidence: null,
            evidence: evidenceRefs,
        },
        issues: parsed.issues.map((value) => issue({ ...value, evidence: evidenceRefs })),
    };
}
function mapEvent(component, eventIndex, sourceId, candidateIdFactory) {
    const temporal = temporalObservation(component, sourceId, eventIndex);
    const recurrence = recurrenceObservation(component, temporal.claim.value?.start ?? null, sourceId, eventIndex);
    const uidValue = component.getFirstPropertyValue("uid");
    const observation = {
        sourceUid: typeof uidValue === "string" ? uidValue : null,
        title: stringClaim(component, "summary", sourceId, eventIndex),
        description: stringClaim(component, "description", sourceId, eventIndex),
        location: stringClaim(component, "location", sourceId, eventIndex),
        url: stringClaim(component, "url", sourceId, eventIndex),
        temporal: temporal.claim,
        recurrence: recurrence.claim,
        issues: [...temporal.issues, ...recurrence.issues],
    };
    return createCandidate(observation, candidateIdFactory);
}
export function parseIcs(input, options) {
    try {
        const calendar = new ICAL.Component(ICAL.parse(input));
        if (calendar.name !== "vcalendar") {
            throw new Error("Expected a VCALENDAR root component.");
        }
        const candidates = calendar
            .getAllSubcomponents("vevent")
            .map((component, index) => mapEvent(component, index + 1, options.sourceId, options.candidateIdFactory));
        return { candidates, issues: [] };
    }
    catch {
        return {
            candidates: [],
            issues: sortIssues([
                scannerIssue("malformed_ics", "scan", "The iCalendar input is malformed.", [evidence(options.sourceId, "VCALENDAR", input)]),
            ]),
        };
    }
}
//# sourceMappingURL=parse.js.map