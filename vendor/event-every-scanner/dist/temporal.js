import { Temporal } from "@js-temporal/polyfill";
import { ISSUE_TRAITS, } from "./contracts.js";
import { deduplicateIssues, issue, sortIssues, } from "./issues.js";
function temporalIssue(code, message, evidence = []) {
    const { kind, severity } = ISSUE_TRAITS[code];
    return issue({
        code,
        kind,
        severity,
        field: "temporal",
        message,
        evidence,
    });
}
export function resolveZonedPoint(point, evidence) {
    let requested;
    let candidates;
    try {
        requested = plainDateTime(point.date, point.time);
        const input = {
            ...point.date,
            ...point.time,
            timeZone: point.timeZone,
        };
        candidates = [
            Temporal.ZonedDateTime.from(input, { disambiguation: "earlier" }),
            Temporal.ZonedDateTime.from(input, { disambiguation: "later" }),
        ];
    }
    catch {
        return {
            point: {
                ...point,
                possibleOffsets: [],
                chosenOffset: null,
            },
            issues: [
                temporalIssue("invalid_time_zone", "The local date, time, or IANA timezone identifier is invalid.", evidence),
            ],
        };
    }
    const possibleOffsets = [
        ...new Set(candidates
            .filter((candidate) => candidate.toPlainDateTime().equals(requested))
            .map((candidate) => candidate.offset)),
    ];
    if (possibleOffsets.length === 0) {
        return {
            point: {
                ...point,
                resolution: "gap",
                possibleOffsets: [],
                chosenOffset: null,
            },
            issues: [
                temporalIssue("dst_gap", "This local time does not exist in the selected timezone.", evidence),
            ],
        };
    }
    const selectedOffset = point.chosenOffset ?? point.sourceOffset;
    if (selectedOffset !== null) {
        if (evidence.length > 0 &&
            possibleOffsets.includes(selectedOffset)) {
            return {
                point: {
                    ...point,
                    resolution: "offset_resolved",
                    possibleOffsets,
                    chosenOffset: selectedOffset,
                },
                issues: [],
            };
        }
        const issues = [
            temporalIssue("offset_mismatch", evidence.length === 0
                ? "An offset choice requires retained source or review evidence."
                : "The supplied offset does not match this local time and timezone.", evidence),
        ];
        if (possibleOffsets.length === 2) {
            issues.push(temporalIssue("dst_fold", "This local time occurs twice and requires an explicit offset.", evidence));
        }
        return {
            point: {
                ...point,
                resolution: possibleOffsets.length === 2 ? "fold" : "exact",
                possibleOffsets,
                chosenOffset: null,
            },
            issues: sortIssues(deduplicateIssues(issues)),
        };
    }
    if (possibleOffsets.length === 2) {
        return {
            point: {
                ...point,
                resolution: "fold",
                possibleOffsets,
                chosenOffset: null,
            },
            issues: [
                temporalIssue("dst_fold", "This local time occurs twice and requires an explicit offset.", evidence),
            ],
        };
    }
    return {
        point: {
            ...point,
            resolution: "exact",
            possibleOffsets,
            chosenOffset: null,
        },
        issues: [],
    };
}
function plainDate(value) {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
}
function plainDateTime(date, time) {
    return Temporal.PlainDateTime.from({ ...date, ...time }, { overflow: "reject" });
}
function validatePoint(point) {
    try {
        if (point.kind === "date") {
            if (point.year === null) {
                Temporal.PlainMonthDay.from({ month: point.month, day: point.day }, { overflow: "reject" });
                return [
                    temporalIssue("missing_year", "The date year is unresolved."),
                ];
            }
            plainDate({ year: point.year, month: point.month, day: point.day });
            return [];
        }
        if (point.kind === "floating") {
            plainDateTime(point.date, point.time);
            return [
                temporalIssue("floating_time", "This floating time will use the importing calendar's local timezone."),
            ];
        }
        if (point.kind === "zoned") {
            plainDateTime(point.date, point.time);
            Temporal.Instant.from("1970-01-01T00:00:00Z").toZonedDateTimeISO(point.timeZone);
            return [];
        }
        return [
            temporalIssue("field_incomplete", "The temporal value is incomplete."),
        ];
    }
    catch {
        if (point.kind === "zoned") {
            try {
                plainDateTime(point.date, point.time);
            }
            catch {
                return [
                    temporalIssue("invalid_date", "The local date or time is invalid."),
                ];
            }
            return [
                temporalIssue("invalid_time_zone", "The IANA timezone identifier is invalid."),
            ];
        }
        return [
            temporalIssue(point.kind === "floating" ? "invalid_time" : "invalid_date", point.kind === "floating"
                ? "The local date or time is invalid."
                : "The calendar date is invalid."),
        ];
    }
}
function pointKindCompatibleWithAllDay(point, allDay) {
    if (allDay === "unknown" || point.kind === "partial") {
        return true;
    }
    return allDay ? point.kind === "date" : point.kind !== "date";
}
function resolvedZonedDateTime(point) {
    const offset = point.chosenOffset ??
        point.sourceOffset ??
        (point.possibleOffsets.length === 1
            ? point.possibleOffsets[0]
            : undefined);
    if (offset === undefined) {
        return null;
    }
    const date = `${String(point.date.year).padStart(4, "0")}-${String(point.date.month).padStart(2, "0")}-${String(point.date.day).padStart(2, "0")}`;
    const time = `${String(point.time.hour).padStart(2, "0")}:${String(point.time.minute).padStart(2, "0")}:${String(point.time.second).padStart(2, "0")}`;
    try {
        return Temporal.ZonedDateTime.from(`${date}T${time}${offset}[${point.timeZone}]`, { disambiguation: "reject", offset: "reject" });
    }
    catch {
        return null;
    }
}
export function compareTemporalPoints(left, right) {
    if (left.kind !== right.kind) {
        return null;
    }
    try {
        if (left.kind === "date" && right.kind === "date") {
            if (left.year === null || right.year === null) {
                return null;
            }
            return Temporal.PlainDate.compare({ year: left.year, month: left.month, day: left.day }, { year: right.year, month: right.month, day: right.day });
        }
        if (left.kind === "floating" && right.kind === "floating") {
            return Temporal.PlainDateTime.compare(plainDateTime(left.date, left.time), plainDateTime(right.date, right.time));
        }
        if (left.kind === "zoned" && right.kind === "zoned") {
            const leftZoned = resolvedZonedDateTime(left);
            const rightZoned = resolvedZonedDateTime(right);
            if (leftZoned === null || rightZoned === null) {
                return null;
            }
            return Temporal.ZonedDateTime.compare(leftZoned, rightZoned);
        }
    }
    catch {
        return null;
    }
    return null;
}
function addDuration(point, duration) {
    try {
        if (point.kind === "date" && point.year !== null) {
            const result = plainDate({
                year: point.year,
                month: point.month,
                day: point.day,
            }).add(duration);
            return {
                kind: "date",
                year: result.year,
                month: result.month,
                day: result.day,
            };
        }
        if (point.kind === "floating") {
            const result = plainDateTime(point.date, point.time).add(duration);
            return {
                kind: "floating",
                date: {
                    year: result.year,
                    month: result.month,
                    day: result.day,
                },
                time: {
                    hour: result.hour,
                    minute: result.minute,
                    second: result.second,
                },
            };
        }
        if (point.kind === "zoned") {
            const zoned = resolvedZonedDateTime(point);
            if (zoned === null) {
                return null;
            }
            const result = zoned.add(duration);
            return {
                ...point,
                date: {
                    year: result.year,
                    month: result.month,
                    day: result.day,
                },
                time: {
                    hour: result.hour,
                    minute: result.minute,
                    second: result.second,
                },
                chosenOffset: result.offset,
                possibleOffsets: [result.offset],
                resolution: "offset_resolved",
            };
        }
    }
    catch {
        return null;
    }
    return null;
}
export function validateTemporalClaim(claim) {
    const issues = [];
    if (claim.start === null) {
        issues.push(temporalIssue("missing_start", "The event start is missing."));
    }
    else {
        issues.push(...validatePoint(claim.start));
    }
    if (claim.end !== null) {
        issues.push(...validatePoint(claim.end));
    }
    if (claim.allDay === "unknown") {
        issues.push(temporalIssue("unknown_all_day", "Whether this event is all-day is unresolved."));
    }
    if ((claim.start !== null &&
        !pointKindCompatibleWithAllDay(claim.start, claim.allDay)) ||
        (claim.end !== null &&
            !pointKindCompatibleWithAllDay(claim.end, claim.allDay)) ||
        (claim.start !== null &&
            claim.end !== null &&
            claim.start.kind !== claim.end.kind)) {
        issues.push(temporalIssue("incompatible_temporal_kinds", "The start, end, and all-day semantics are incompatible."));
    }
    if (claim.start !== null && claim.end !== null) {
        const comparison = compareTemporalPoints(claim.end, claim.start);
        if (comparison === -1) {
            issues.push(temporalIssue("end_before_start", "The event end occurs before its start."));
        }
    }
    let duration = null;
    if (claim.duration !== null) {
        try {
            duration = Temporal.Duration.from(claim.duration);
            if (duration.sign < 0) {
                issues.push(temporalIssue("invalid_duration", "The event duration cannot be negative."));
                duration = null;
            }
        }
        catch {
            issues.push(temporalIssue("invalid_duration", "The event duration is not valid ISO 8601."));
        }
    }
    if (duration !== null &&
        claim.start !== null &&
        claim.end !== null) {
        const expectedEnd = addDuration(claim.start, duration);
        if (expectedEnd === null ||
            compareTemporalPoints(expectedEnd, claim.end) !== 0) {
            issues.push(temporalIssue("end_duration_conflict", "The explicit end and duration do not agree."));
        }
    }
    return sortIssues(deduplicateIssues(issues));
}
//# sourceMappingURL=temporal.js.map