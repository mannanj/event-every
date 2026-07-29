import {} from "../contracts.js";
import { canonicalizeRecurrence } from "../recurrence.js";
import { escapeText, joinContentLines } from "./text.js";
function assertNoLineBreaks(value, field) {
    if (/[\r\n]/.test(value)) {
        throw new Error(`${field} cannot contain a line break.`);
    }
}
function pad(value, length = 2) {
    return String(value).padStart(length, "0");
}
function formatDate(point) {
    if (point.year === null) {
        throw new Error("Cannot serialize a date with an unresolved year.");
    }
    return `${pad(point.year, 4)}${pad(point.month)}${pad(point.day)}`;
}
function formatLocalDateTime(point) {
    return `${pad(point.date.year, 4)}${pad(point.date.month)}${pad(point.date.day)}T${pad(point.time.hour)}${pad(point.time.minute)}${pad(point.time.second)}`;
}
function formatTemporalProperty(name, point) {
    if (point.kind === "date") {
        return `${name};VALUE=DATE:${formatDate(point)}`;
    }
    if (point.kind === "floating") {
        return `${name}:${formatLocalDateTime(point)}`;
    }
    if (point.kind === "zoned") {
        const value = formatLocalDateTime(point);
        if (point.timeZone === "UTC") {
            return `${name}:${value}Z`;
        }
        assertNoLineBreaks(point.timeZone, "TZID");
        return `${name};TZID=${point.timeZone}:${value}`;
    }
    throw new Error(`Cannot serialize an incomplete ${name} value.`);
}
function formatRecurrenceValues(name, points) {
    const first = points[0];
    if (first === undefined) {
        return null;
    }
    if (first.kind === "date") {
        if (points.some((point) => point.kind !== "date")) {
            throw new Error(`${name} values must use one temporal kind.`);
        }
        return `${name};VALUE=DATE:${points
            .map((point) => formatDate(point))
            .join(",")}`;
    }
    if (first.kind === "floating") {
        if (points.some((point) => point.kind !== "floating")) {
            throw new Error(`${name} values must use one temporal kind.`);
        }
        return `${name}:${points
            .map((point) => formatLocalDateTime(point))
            .join(",")}`;
    }
    if (first.kind === "zoned") {
        const sameZone = points.every((point) => point.kind === "zoned" && point.timeZone === first.timeZone);
        if (!sameZone) {
            throw new Error(`${name} values must use one timezone.`);
        }
        const values = points
            .map((point) => formatLocalDateTime(point))
            .join(",");
        if (first.timeZone === "UTC") {
            return `${name}:${values
                .split(",")
                .map((value) => `${value}Z`)
                .join(",")}`;
        }
        assertNoLineBreaks(first.timeZone, "TZID");
        return `${name};TZID=${first.timeZone}:${values}`;
    }
    throw new Error(`Cannot serialize incomplete ${name} values.`);
}
function formatDtstamp(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
    if (match === null) {
        throw new Error("DTSTAMP must be a complete UTC instant.");
    }
    return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}
function pushText(lines, name, value) {
    if (value !== null) {
        lines.push(`${name}:${escapeText(value)}`);
    }
}
export function serializeIcs(candidate, policy) {
    const temporal = candidate.temporal.value;
    if (temporal === null || temporal.start === null) {
        throw new Error("Cannot serialize an event without a start.");
    }
    if (policy.uid === null) {
        throw new Error("Cannot serialize an event without an export UID.");
    }
    assertNoLineBreaks(policy.uid, "UID");
    assertNoLineBreaks(policy.prodId, "PRODID");
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:${escapeText(policy.prodId)}`,
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${escapeText(policy.uid)}`,
        `DTSTAMP:${formatDtstamp(policy.dtstamp)}`,
        formatTemporalProperty("DTSTART", temporal.start),
    ];
    if (temporal.end !== null) {
        lines.push(formatTemporalProperty("DTEND", temporal.end));
    }
    else if (temporal.duration !== null) {
        assertNoLineBreaks(temporal.duration, "DURATION");
        lines.push(`DURATION:${temporal.duration}`);
    }
    pushText(lines, "SUMMARY", candidate.title.value);
    pushText(lines, "DESCRIPTION", candidate.description.value);
    pushText(lines, "LOCATION", candidate.location.value);
    if (candidate.url.value !== null) {
        assertNoLineBreaks(candidate.url.value, "URL");
        lines.push(`URL:${candidate.url.value}`);
    }
    if (candidate.recurrence.value !== null) {
        const recurrence = canonicalizeRecurrence(candidate.recurrence.value);
        lines.push(`RRULE:${recurrence.rrule}`);
        const rDate = formatRecurrenceValues("RDATE", recurrence.rDates);
        if (rDate !== null) {
            lines.push(rDate);
        }
        const exDate = formatRecurrenceValues("EXDATE", recurrence.exDates);
        if (exDate !== null) {
            lines.push(exDate);
        }
    }
    lines.push("END:VEVENT", "END:VCALENDAR");
    return joinContentLines(lines);
}
//# sourceMappingURL=serialize.js.map