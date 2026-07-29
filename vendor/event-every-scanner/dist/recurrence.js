import { Temporal } from "@js-temporal/polyfill";
import ICAL from "ical.js";
import { ISSUE_TRAITS, RecurrenceClaimSchema, } from "./contracts.js";
import { issue } from "./issues.js";
const SUPPORTED_PARTS = new Set([
    "FREQ",
    "INTERVAL",
    "COUNT",
    "UNTIL",
    "BYMONTH",
    "BYMONTHDAY",
    "BYDAY",
    "WKST",
]);
const FREQUENCIES = new Set([
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
]);
const WEEKDAYS = [
    "MO",
    "TU",
    "WE",
    "TH",
    "FR",
    "SA",
    "SU",
];
const WEEKDAY_INDEX = new Map(WEEKDAYS.map((weekday, index) => [weekday, index]));
function recurrenceIssue(code, message) {
    const { kind, severity } = ISSUE_TRAITS[code];
    return issue({
        code,
        kind,
        severity,
        field: "recurrence",
        message,
        evidence: [],
    });
}
function parsePositiveInteger(value) {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}
function parseIntegerList(value, minimum, maximum, allowNegative) {
    const parsed = value.split(",").map((part) => {
        if (!/^-?\d+$/.test(part)) {
            return null;
        }
        const number = Number(part);
        if (!Number.isSafeInteger(number) ||
            number === 0 ||
            number < minimum ||
            number > maximum ||
            (!allowNegative && number < 0)) {
            return null;
        }
        return number;
    });
    if (parsed.some((number) => number === null)) {
        return null;
    }
    return [...new Set(parsed)].sort((left, right) => left - right);
}
function parseByDay(value) {
    const parsed = value.split(",").map((part) => {
        const match = /^([+-]?(?:[1-9]|[1-4]\d|5[0-3]))?(MO|TU|WE|TH|FR|SA|SU)$/.exec(part);
        if (match === null) {
            return null;
        }
        return {
            ordinal: match[1] === undefined ? null : Number(match[1]),
            weekday: match[2],
        };
    });
    if (parsed.some((value) => value === null)) {
        return null;
    }
    return parsed;
}
function parseUntil(value) {
    const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (dateMatch !== null) {
        const date = {
            year: Number(dateMatch[1]),
            month: Number(dateMatch[2]),
            day: Number(dateMatch[3]),
        };
        try {
            Temporal.PlainDate.from(date, { overflow: "reject" });
        }
        catch {
            return null;
        }
        return {
            kind: "date",
            ...date,
        };
    }
    const dateTimeMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
    if (dateTimeMatch === null) {
        return null;
    }
    const date = {
        year: Number(dateTimeMatch[1]),
        month: Number(dateTimeMatch[2]),
        day: Number(dateTimeMatch[3]),
    };
    const time = {
        hour: Number(dateTimeMatch[4]),
        minute: Number(dateTimeMatch[5]),
        second: Number(dateTimeMatch[6]),
    };
    try {
        Temporal.PlainDateTime.from({ ...date, ...time }, { overflow: "reject" });
    }
    catch {
        return null;
    }
    if (dateTimeMatch[7] === "Z") {
        return {
            kind: "zoned",
            date,
            time,
            timeZone: "UTC",
            resolution: "exact",
            possibleOffsets: ["+00:00"],
            sourceOffset: "+00:00",
            chosenOffset: "+00:00",
        };
    }
    return { kind: "floating", date, time };
}
function untilMatchesStart(until, start) {
    if (start.kind === "date") {
        return until.kind === "date";
    }
    if (start.kind === "floating") {
        return until.kind === "floating";
    }
    if (start.kind === "zoned") {
        return until.kind === "zoned" && until.timeZone === "UTC";
    }
    return false;
}
function exceptionMatchesStart(value, start) {
    if (start.kind === "date") {
        return value.kind === "date" && value.year !== null;
    }
    if (start.kind === "floating") {
        return value.kind === "floating";
    }
    if (start.kind === "zoned") {
        return value.kind === "zoned" && value.timeZone === start.timeZone;
    }
    return false;
}
function fail(code, message) {
    return { recurrence: null, issues: [recurrenceIssue(code, message)] };
}
export function parseRecurrence(input) {
    try {
        ICAL.Recur.fromString(input.rrule);
    }
    catch {
        return fail("invalid_recurrence", "The recurrence rule syntax is invalid.");
    }
    const values = new Map();
    for (const segment of input.rrule.split(";")) {
        const separator = segment.indexOf("=");
        if (separator <= 0 || separator === segment.length - 1) {
            return fail("invalid_recurrence", "The recurrence rule syntax is invalid.");
        }
        const name = segment.slice(0, separator).toUpperCase();
        const value = segment.slice(separator + 1).toUpperCase();
        if (values.has(name)) {
            return fail("invalid_recurrence", `The ${name} part appears more than once.`);
        }
        if (!SUPPORTED_PARTS.has(name)) {
            return fail("unsupported_recurrence", `The ${name} recurrence part is not supported in Packet 1.`);
        }
        values.set(name, value);
    }
    const frequency = values.get("FREQ");
    if (frequency === undefined) {
        return fail("invalid_recurrence", "FREQ is required.");
    }
    if (!FREQUENCIES.has(frequency)) {
        return fail("unsupported_recurrence", `The ${frequency} frequency is not supported in Packet 1.`);
    }
    const intervalValue = values.get("INTERVAL");
    const interval = intervalValue === undefined ? null : parsePositiveInteger(intervalValue);
    const countValue = values.get("COUNT");
    const count = countValue === undefined ? null : parsePositiveInteger(countValue);
    if ((intervalValue !== undefined && interval === null) ||
        (countValue !== undefined && count === null)) {
        return fail("invalid_recurrence", "INTERVAL and COUNT must be positive integers.");
    }
    const untilValue = values.get("UNTIL");
    const until = untilValue === undefined ? null : parseUntil(untilValue);
    if (untilValue !== undefined && until === null) {
        return fail("invalid_recurrence", "UNTIL is not a valid iCalendar value.");
    }
    if (count !== null && until !== null) {
        return fail("invalid_recurrence", "COUNT and UNTIL cannot appear in the same rule.");
    }
    if (until !== null && !untilMatchesStart(until, input.start)) {
        return fail("invalid_recurrence", "UNTIL does not match DTSTART value and timezone semantics.");
    }
    const byMonthValue = values.get("BYMONTH");
    const byMonth = byMonthValue === undefined
        ? []
        : parseIntegerList(byMonthValue, 1, 12, false);
    const byMonthDayValue = values.get("BYMONTHDAY");
    const byMonthDay = byMonthDayValue === undefined
        ? []
        : parseIntegerList(byMonthDayValue, -31, 31, true);
    const byDayValue = values.get("BYDAY");
    const byDay = byDayValue === undefined ? [] : parseByDay(byDayValue);
    if (byMonth === null || byMonthDay === null || byDay === null) {
        return fail("invalid_recurrence", "A BY rule part contains an invalid value.");
    }
    if (frequency === "WEEKLY" && byMonthDay.length > 0) {
        return fail("invalid_recurrence", "BYMONTHDAY is invalid with WEEKLY.");
    }
    if (!["MONTHLY", "YEARLY"].includes(frequency) &&
        byDay.some(({ ordinal }) => ordinal !== null)) {
        return fail("invalid_recurrence", "Numeric BYDAY values require MONTHLY or YEARLY.");
    }
    const weekStartValue = values.get("WKST");
    const weekStart = weekStartValue === undefined ? null : weekStartValue;
    if (weekStart !== null && !WEEKDAYS.includes(weekStart)) {
        return fail("invalid_recurrence", "WKST is not a valid weekday.");
    }
    if ([...input.rDates, ...input.exDates].some((value) => !exceptionMatchesStart(value, input.start))) {
        return fail("invalid_recurrence", "RDATE and EXDATE values must match DTSTART semantics.");
    }
    const rule = {
        frequency,
        interval,
        count,
        until,
        byMonth,
        byMonthDay,
        byDay,
        weekStart,
    };
    return {
        recurrence: RecurrenceClaimSchema.parse({
            rule,
            rDates: input.rDates,
            exDates: input.exDates,
        }),
        issues: [],
    };
}
function formatPoint(point) {
    if (point.kind === "date") {
        if (point.year === null) {
            throw new Error("Cannot canonicalize a date with a missing year.");
        }
        return `${String(point.year).padStart(4, "0")}${String(point.month).padStart(2, "0")}${String(point.day).padStart(2, "0")}`;
    }
    if (point.kind === "partial") {
        throw new Error("Cannot canonicalize an incomplete recurrence value.");
    }
    const date = `${String(point.date.year).padStart(4, "0")}${String(point.date.month).padStart(2, "0")}${String(point.date.day).padStart(2, "0")}`;
    const time = `${String(point.time.hour).padStart(2, "0")}${String(point.time.minute).padStart(2, "0")}${String(point.time.second).padStart(2, "0")}`;
    return `${date}T${time}${point.kind === "zoned" && point.timeZone === "UTC" ? "Z" : ""}`;
}
function sortPoints(points) {
    return [...points].sort((left, right) => formatPoint(left).localeCompare(formatPoint(right)));
}
export function canonicalizeRecurrence(recurrence) {
    const { rule } = recurrence;
    const parts = [`FREQ=${rule.frequency}`];
    if (rule.interval !== null)
        parts.push(`INTERVAL=${rule.interval}`);
    if (rule.count !== null)
        parts.push(`COUNT=${rule.count}`);
    if (rule.until !== null)
        parts.push(`UNTIL=${formatPoint(rule.until)}`);
    if (rule.byMonth.length > 0) {
        parts.push(`BYMONTH=${[...new Set(rule.byMonth)].sort((a, b) => a - b).join(",")}`);
    }
    if (rule.byMonthDay.length > 0) {
        parts.push(`BYMONTHDAY=${[...new Set(rule.byMonthDay)].sort((a, b) => a - b).join(",")}`);
    }
    if (rule.byDay.length > 0) {
        const sorted = [...rule.byDay].sort((left, right) => {
            const weekday = (WEEKDAY_INDEX.get(left.weekday) ?? 0) -
                (WEEKDAY_INDEX.get(right.weekday) ?? 0);
            return weekday !== 0
                ? weekday
                : (left.ordinal ?? 0) - (right.ordinal ?? 0);
        });
        parts.push(`BYDAY=${sorted
            .map(({ ordinal, weekday }) => `${ordinal ?? ""}${weekday}`)
            .join(",")}`);
    }
    if (rule.weekStart !== null)
        parts.push(`WKST=${rule.weekStart}`);
    return {
        rrule: parts.join(";"),
        rDates: sortPoints(recurrence.rDates),
        exDates: sortPoints(recurrence.exDates),
    };
}
//# sourceMappingURL=recurrence.js.map