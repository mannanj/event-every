import { z } from "zod";
export declare const EvidenceRefSchema: z.ZodReadonly<z.ZodObject<{
    sourceId: z.ZodString;
    locator: z.ZodNullable<z.ZodString>;
    excerpt: z.ZodNullable<z.ZodString>;
    startOffset: z.ZodNullable<z.ZodNumber>;
    endOffset: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ClaimedField<T> = Readonly<{
    value: T | null;
    confidence: number | null;
    evidence: readonly EvidenceRef[];
}>;
export declare const CompleteDateSchema: z.ZodReadonly<z.ZodObject<{
    year: z.ZodNumber;
    month: z.ZodNumber;
    day: z.ZodNumber;
}, z.core.$strict>>;
export type CompleteDate = z.infer<typeof CompleteDateSchema>;
export declare const CompleteTimeSchema: z.ZodReadonly<z.ZodObject<{
    hour: z.ZodNumber;
    minute: z.ZodNumber;
    second: z.ZodNumber;
}, z.core.$strict>>;
export type CompleteTime = z.infer<typeof CompleteTimeSchema>;
export declare const TemporalPointSchema: z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
    kind: z.ZodLiteral<"date">;
    year: z.ZodNullable<z.ZodNumber>;
    month: z.ZodNumber;
    day: z.ZodNumber;
}, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
    kind: z.ZodLiteral<"floating">;
    date: z.ZodReadonly<z.ZodObject<{
        year: z.ZodNumber;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>;
    time: z.ZodReadonly<z.ZodObject<{
        hour: z.ZodNumber;
        minute: z.ZodNumber;
        second: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
    kind: z.ZodLiteral<"zoned">;
    date: z.ZodReadonly<z.ZodObject<{
        year: z.ZodNumber;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>;
    time: z.ZodReadonly<z.ZodObject<{
        hour: z.ZodNumber;
        minute: z.ZodNumber;
        second: z.ZodNumber;
    }, z.core.$strict>>;
    timeZone: z.ZodString;
    resolution: z.ZodEnum<{
        exact: "exact";
        gap: "gap";
        fold: "fold";
        offset_resolved: "offset_resolved";
    }>;
    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    sourceOffset: z.ZodNullable<z.ZodString>;
    chosenOffset: z.ZodNullable<z.ZodString>;
}, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
    kind: z.ZodLiteral<"partial">;
    year: z.ZodNullable<z.ZodNumber>;
    month: z.ZodNullable<z.ZodNumber>;
    day: z.ZodNullable<z.ZodNumber>;
    hour: z.ZodNullable<z.ZodNumber>;
    minute: z.ZodNullable<z.ZodNumber>;
    second: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>>], "kind">;
export type TemporalPoint = z.infer<typeof TemporalPointSchema>;
export declare const TemporalClaimSchema: z.ZodReadonly<z.ZodObject<{
    start: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"date">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"floating">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"zoned">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
        timeZone: z.ZodString;
        resolution: z.ZodEnum<{
            exact: "exact";
            gap: "gap";
            fold: "fold";
            offset_resolved: "offset_resolved";
        }>;
        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        sourceOffset: z.ZodNullable<z.ZodString>;
        chosenOffset: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNullable<z.ZodNumber>;
        day: z.ZodNullable<z.ZodNumber>;
        hour: z.ZodNullable<z.ZodNumber>;
        minute: z.ZodNullable<z.ZodNumber>;
        second: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>], "kind">>;
    end: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"date">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"floating">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"zoned">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
        timeZone: z.ZodString;
        resolution: z.ZodEnum<{
            exact: "exact";
            gap: "gap";
            fold: "fold";
            offset_resolved: "offset_resolved";
        }>;
        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        sourceOffset: z.ZodNullable<z.ZodString>;
        chosenOffset: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNullable<z.ZodNumber>;
        day: z.ZodNullable<z.ZodNumber>;
        hour: z.ZodNullable<z.ZodNumber>;
        minute: z.ZodNullable<z.ZodNumber>;
        second: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>], "kind">>;
    duration: z.ZodNullable<z.ZodString>;
    allDay: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"unknown">]>;
}, z.core.$strict>>;
export type TemporalClaim = z.infer<typeof TemporalClaimSchema>;
export declare const ByDaySchema: z.ZodReadonly<z.ZodObject<{
    ordinal: z.ZodNullable<z.ZodNumber>;
    weekday: z.ZodEnum<{
        MO: "MO";
        TU: "TU";
        WE: "WE";
        TH: "TH";
        FR: "FR";
        SA: "SA";
        SU: "SU";
    }>;
}, z.core.$strict>>;
export type ByDay = z.infer<typeof ByDaySchema>;
export declare const RecurrenceRuleSchema: z.ZodReadonly<z.ZodObject<{
    frequency: z.ZodEnum<{
        DAILY: "DAILY";
        WEEKLY: "WEEKLY";
        MONTHLY: "MONTHLY";
        YEARLY: "YEARLY";
    }>;
    interval: z.ZodNullable<z.ZodNumber>;
    count: z.ZodNullable<z.ZodNumber>;
    until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"date">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"floating">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"zoned">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
        timeZone: z.ZodString;
        resolution: z.ZodEnum<{
            exact: "exact";
            gap: "gap";
            fold: "fold";
            offset_resolved: "offset_resolved";
        }>;
        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        sourceOffset: z.ZodNullable<z.ZodString>;
        chosenOffset: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNullable<z.ZodNumber>;
        day: z.ZodNullable<z.ZodNumber>;
        hour: z.ZodNullable<z.ZodNumber>;
        minute: z.ZodNullable<z.ZodNumber>;
        second: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>], "kind">>;
    byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
    byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
    byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        ordinal: z.ZodNullable<z.ZodNumber>;
        weekday: z.ZodEnum<{
            MO: "MO";
            TU: "TU";
            WE: "WE";
            TH: "TH";
            FR: "FR";
            SA: "SA";
            SU: "SU";
        }>;
    }, z.core.$strict>>>>;
    weekStart: z.ZodNullable<z.ZodEnum<{
        MO: "MO";
        TU: "TU";
        WE: "WE";
        TH: "TH";
        FR: "FR";
        SA: "SA";
        SU: "SU";
    }>>;
}, z.core.$strict>>;
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
export type RecurrenceFrequency = RecurrenceRule["frequency"];
export type Weekday = ByDay["weekday"];
export declare const RecurrenceClaimSchema: z.ZodReadonly<z.ZodObject<{
    rule: z.ZodReadonly<z.ZodObject<{
        frequency: z.ZodEnum<{
            DAILY: "DAILY";
            WEEKLY: "WEEKLY";
            MONTHLY: "MONTHLY";
            YEARLY: "YEARLY";
        }>;
        interval: z.ZodNullable<z.ZodNumber>;
        count: z.ZodNullable<z.ZodNumber>;
        until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"date">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"floating">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"zoned">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
            timeZone: z.ZodString;
            resolution: z.ZodEnum<{
                exact: "exact";
                gap: "gap";
                fold: "fold";
                offset_resolved: "offset_resolved";
            }>;
            possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            sourceOffset: z.ZodNullable<z.ZodString>;
            chosenOffset: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"partial">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNullable<z.ZodNumber>;
            day: z.ZodNullable<z.ZodNumber>;
            hour: z.ZodNullable<z.ZodNumber>;
            minute: z.ZodNullable<z.ZodNumber>;
            second: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>], "kind">>;
        byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
        byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
        byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            ordinal: z.ZodNullable<z.ZodNumber>;
            weekday: z.ZodEnum<{
                MO: "MO";
                TU: "TU";
                WE: "WE";
                TH: "TH";
                FR: "FR";
                SA: "SA";
                SU: "SU";
            }>;
        }, z.core.$strict>>>>;
        weekStart: z.ZodNullable<z.ZodEnum<{
            MO: "MO";
            TU: "TU";
            WE: "WE";
            TH: "TH";
            FR: "FR";
            SA: "SA";
            SU: "SU";
        }>>;
    }, z.core.$strict>>;
    rDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"date">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"floating">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"zoned">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
        timeZone: z.ZodString;
        resolution: z.ZodEnum<{
            exact: "exact";
            gap: "gap";
            fold: "fold";
            offset_resolved: "offset_resolved";
        }>;
        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        sourceOffset: z.ZodNullable<z.ZodString>;
        chosenOffset: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNullable<z.ZodNumber>;
        day: z.ZodNullable<z.ZodNumber>;
        hour: z.ZodNullable<z.ZodNumber>;
        minute: z.ZodNullable<z.ZodNumber>;
        second: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>], "kind">>>;
    exDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"date">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNumber;
        day: z.ZodNumber;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"floating">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"zoned">;
        date: z.ZodReadonly<z.ZodObject<{
            year: z.ZodNumber;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>;
        time: z.ZodReadonly<z.ZodObject<{
            hour: z.ZodNumber;
            minute: z.ZodNumber;
            second: z.ZodNumber;
        }, z.core.$strict>>;
        timeZone: z.ZodString;
        resolution: z.ZodEnum<{
            exact: "exact";
            gap: "gap";
            fold: "fold";
            offset_resolved: "offset_resolved";
        }>;
        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        sourceOffset: z.ZodNullable<z.ZodString>;
        chosenOffset: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        year: z.ZodNullable<z.ZodNumber>;
        month: z.ZodNullable<z.ZodNumber>;
        day: z.ZodNullable<z.ZodNumber>;
        hour: z.ZodNullable<z.ZodNumber>;
        minute: z.ZodNullable<z.ZodNumber>;
        second: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>], "kind">>>;
}, z.core.$strict>>;
export type RecurrenceClaim = z.infer<typeof RecurrenceClaimSchema>;
export declare const StringClaimSchema: z.ZodReadonly<z.ZodObject<{
    value: z.ZodNullable<z.ZodString>;
    confidence: z.ZodNullable<z.ZodNumber>;
    evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        sourceId: z.ZodString;
        locator: z.ZodNullable<z.ZodString>;
        excerpt: z.ZodNullable<z.ZodString>;
        startOffset: z.ZodNullable<z.ZodNumber>;
        endOffset: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export declare const TemporalClaimFieldSchema: z.ZodReadonly<z.ZodObject<{
    value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
        start: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"date">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"floating">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"zoned">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
            timeZone: z.ZodString;
            resolution: z.ZodEnum<{
                exact: "exact";
                gap: "gap";
                fold: "fold";
                offset_resolved: "offset_resolved";
            }>;
            possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            sourceOffset: z.ZodNullable<z.ZodString>;
            chosenOffset: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"partial">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNullable<z.ZodNumber>;
            day: z.ZodNullable<z.ZodNumber>;
            hour: z.ZodNullable<z.ZodNumber>;
            minute: z.ZodNullable<z.ZodNumber>;
            second: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>], "kind">>;
        end: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"date">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"floating">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"zoned">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
            timeZone: z.ZodString;
            resolution: z.ZodEnum<{
                exact: "exact";
                gap: "gap";
                fold: "fold";
                offset_resolved: "offset_resolved";
            }>;
            possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            sourceOffset: z.ZodNullable<z.ZodString>;
            chosenOffset: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"partial">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNullable<z.ZodNumber>;
            day: z.ZodNullable<z.ZodNumber>;
            hour: z.ZodNullable<z.ZodNumber>;
            minute: z.ZodNullable<z.ZodNumber>;
            second: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>], "kind">>;
        duration: z.ZodNullable<z.ZodString>;
        allDay: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"unknown">]>;
    }, z.core.$strict>>>;
    confidence: z.ZodNullable<z.ZodNumber>;
    evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        sourceId: z.ZodString;
        locator: z.ZodNullable<z.ZodString>;
        excerpt: z.ZodNullable<z.ZodString>;
        startOffset: z.ZodNullable<z.ZodNumber>;
        endOffset: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export declare const RecurrenceClaimFieldSchema: z.ZodReadonly<z.ZodObject<{
    value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
        rule: z.ZodReadonly<z.ZodObject<{
            frequency: z.ZodEnum<{
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                MONTHLY: "MONTHLY";
                YEARLY: "YEARLY";
            }>;
            interval: z.ZodNullable<z.ZodNumber>;
            count: z.ZodNullable<z.ZodNumber>;
            until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>;
            byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
            byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
            byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                ordinal: z.ZodNullable<z.ZodNumber>;
                weekday: z.ZodEnum<{
                    MO: "MO";
                    TU: "TU";
                    WE: "WE";
                    TH: "TH";
                    FR: "FR";
                    SA: "SA";
                    SU: "SU";
                }>;
            }, z.core.$strict>>>>;
            weekStart: z.ZodNullable<z.ZodEnum<{
                MO: "MO";
                TU: "TU";
                WE: "WE";
                TH: "TH";
                FR: "FR";
                SA: "SA";
                SU: "SU";
            }>>;
        }, z.core.$strict>>;
        rDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"date">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"floating">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"zoned">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
            timeZone: z.ZodString;
            resolution: z.ZodEnum<{
                exact: "exact";
                gap: "gap";
                fold: "fold";
                offset_resolved: "offset_resolved";
            }>;
            possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            sourceOffset: z.ZodNullable<z.ZodString>;
            chosenOffset: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"partial">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNullable<z.ZodNumber>;
            day: z.ZodNullable<z.ZodNumber>;
            hour: z.ZodNullable<z.ZodNumber>;
            minute: z.ZodNullable<z.ZodNumber>;
            second: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>], "kind">>>;
        exDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"date">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNumber;
            day: z.ZodNumber;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"floating">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"zoned">;
            date: z.ZodReadonly<z.ZodObject<{
                year: z.ZodNumber;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>;
            time: z.ZodReadonly<z.ZodObject<{
                hour: z.ZodNumber;
                minute: z.ZodNumber;
                second: z.ZodNumber;
            }, z.core.$strict>>;
            timeZone: z.ZodString;
            resolution: z.ZodEnum<{
                exact: "exact";
                gap: "gap";
                fold: "fold";
                offset_resolved: "offset_resolved";
            }>;
            possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            sourceOffset: z.ZodNullable<z.ZodString>;
            chosenOffset: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodLiteral<"partial">;
            year: z.ZodNullable<z.ZodNumber>;
            month: z.ZodNullable<z.ZodNumber>;
            day: z.ZodNullable<z.ZodNumber>;
            hour: z.ZodNullable<z.ZodNumber>;
            minute: z.ZodNullable<z.ZodNumber>;
            second: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>], "kind">>>;
    }, z.core.$strict>>>;
    confidence: z.ZodNullable<z.ZodNumber>;
    evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        sourceId: z.ZodString;
        locator: z.ZodNullable<z.ZodString>;
        excerpt: z.ZodNullable<z.ZodString>;
        startOffset: z.ZodNullable<z.ZodNumber>;
        endOffset: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export declare const CandidateFieldSchema: z.ZodEnum<{
    sourceUid: "sourceUid";
    title: "title";
    description: "description";
    location: "location";
    url: "url";
    temporal: "temporal";
    recurrence: "recurrence";
}>;
export type CandidateField = z.infer<typeof CandidateFieldSchema>;
export declare const IssueKindSchema: z.ZodEnum<{
    not_found: "not_found";
    incomplete: "incomplete";
    ambiguous: "ambiguous";
    conflicting: "conflicting";
    invalid: "invalid";
    unsupported: "unsupported";
}>;
export type IssueKind = z.infer<typeof IssueKindSchema>;
export declare const IssueSeveritySchema: z.ZodEnum<{
    blocker: "blocker";
    warning: "warning";
}>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export declare const IssueCodeSchema: z.ZodEnum<{
    field_not_found: "field_not_found";
    field_incomplete: "field_incomplete";
    field_ambiguous: "field_ambiguous";
    field_conflicting: "field_conflicting";
    invalid_url: "invalid_url";
    invalid_date: "invalid_date";
    invalid_time: "invalid_time";
    invalid_time_zone: "invalid_time_zone";
    invalid_duration: "invalid_duration";
    missing_start: "missing_start";
    missing_year: "missing_year";
    unknown_all_day: "unknown_all_day";
    floating_time: "floating_time";
    dst_gap: "dst_gap";
    dst_fold: "dst_fold";
    offset_mismatch: "offset_mismatch";
    end_before_start: "end_before_start";
    end_duration_conflict: "end_duration_conflict";
    incompatible_temporal_kinds: "incompatible_temporal_kinds";
    invalid_recurrence: "invalid_recurrence";
    unsupported_recurrence: "unsupported_recurrence";
    missing_export_uid: "missing_export_uid";
    invalid_dtstamp: "invalid_dtstamp";
    invalid_prodid: "invalid_prodid";
    malformed_ics: "malformed_ics";
}>;
export type IssueCode = z.infer<typeof IssueCodeSchema>;
export declare const ISSUE_TRAITS: {
    readonly field_not_found: {
        readonly kind: "not_found";
        readonly severity: "warning";
    };
    readonly field_incomplete: {
        readonly kind: "incomplete";
        readonly severity: "blocker";
    };
    readonly field_ambiguous: {
        readonly kind: "ambiguous";
        readonly severity: "blocker";
    };
    readonly field_conflicting: {
        readonly kind: "conflicting";
        readonly severity: "blocker";
    };
    readonly invalid_url: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly invalid_date: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly invalid_time: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly invalid_time_zone: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly invalid_duration: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly missing_start: {
        readonly kind: "incomplete";
        readonly severity: "blocker";
    };
    readonly missing_year: {
        readonly kind: "incomplete";
        readonly severity: "blocker";
    };
    readonly unknown_all_day: {
        readonly kind: "ambiguous";
        readonly severity: "blocker";
    };
    readonly floating_time: {
        readonly kind: "ambiguous";
        readonly severity: "warning";
    };
    readonly dst_gap: {
        readonly kind: "ambiguous";
        readonly severity: "blocker";
    };
    readonly dst_fold: {
        readonly kind: "ambiguous";
        readonly severity: "blocker";
    };
    readonly offset_mismatch: {
        readonly kind: "conflicting";
        readonly severity: "blocker";
    };
    readonly end_before_start: {
        readonly kind: "conflicting";
        readonly severity: "blocker";
    };
    readonly end_duration_conflict: {
        readonly kind: "conflicting";
        readonly severity: "blocker";
    };
    readonly incompatible_temporal_kinds: {
        readonly kind: "conflicting";
        readonly severity: "blocker";
    };
    readonly invalid_recurrence: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly unsupported_recurrence: {
        readonly kind: "unsupported";
        readonly severity: "blocker";
    };
    readonly missing_export_uid: {
        readonly kind: "incomplete";
        readonly severity: "blocker";
    };
    readonly invalid_dtstamp: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly invalid_prodid: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
    readonly malformed_ics: {
        readonly kind: "invalid";
        readonly severity: "blocker";
    };
};
export declare const ScannerIssueSchema: z.ZodReadonly<z.ZodObject<{
    code: z.ZodEnum<{
        field_not_found: "field_not_found";
        field_incomplete: "field_incomplete";
        field_ambiguous: "field_ambiguous";
        field_conflicting: "field_conflicting";
        invalid_url: "invalid_url";
        invalid_date: "invalid_date";
        invalid_time: "invalid_time";
        invalid_time_zone: "invalid_time_zone";
        invalid_duration: "invalid_duration";
        missing_start: "missing_start";
        missing_year: "missing_year";
        unknown_all_day: "unknown_all_day";
        floating_time: "floating_time";
        dst_gap: "dst_gap";
        dst_fold: "dst_fold";
        offset_mismatch: "offset_mismatch";
        end_before_start: "end_before_start";
        end_duration_conflict: "end_duration_conflict";
        incompatible_temporal_kinds: "incompatible_temporal_kinds";
        invalid_recurrence: "invalid_recurrence";
        unsupported_recurrence: "unsupported_recurrence";
        missing_export_uid: "missing_export_uid";
        invalid_dtstamp: "invalid_dtstamp";
        invalid_prodid: "invalid_prodid";
        malformed_ics: "malformed_ics";
    }>;
    kind: z.ZodEnum<{
        not_found: "not_found";
        incomplete: "incomplete";
        ambiguous: "ambiguous";
        conflicting: "conflicting";
        invalid: "invalid";
        unsupported: "unsupported";
    }>;
    severity: z.ZodEnum<{
        blocker: "blocker";
        warning: "warning";
    }>;
    field: z.ZodUnion<readonly [z.ZodEnum<{
        sourceUid: "sourceUid";
        title: "title";
        description: "description";
        location: "location";
        url: "url";
        temporal: "temporal";
        recurrence: "recurrence";
    }>, z.ZodLiteral<"candidate">, z.ZodLiteral<"scan">]>;
    message: z.ZodString;
    evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        sourceId: z.ZodString;
        locator: z.ZodNullable<z.ZodString>;
        excerpt: z.ZodNullable<z.ZodString>;
        startOffset: z.ZodNullable<z.ZodNumber>;
        endOffset: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export type ScannerIssue = z.infer<typeof ScannerIssueSchema>;
export declare const CandidateObservationSchema: z.ZodReadonly<z.ZodObject<{
    sourceUid: z.ZodNullable<z.ZodString>;
    title: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    description: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    location: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    url: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    temporal: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
            start: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>;
            end: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>;
            duration: z.ZodNullable<z.ZodString>;
            allDay: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"unknown">]>;
        }, z.core.$strict>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    recurrence: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
            rule: z.ZodReadonly<z.ZodObject<{
                frequency: z.ZodEnum<{
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    MONTHLY: "MONTHLY";
                    YEARLY: "YEARLY";
                }>;
                interval: z.ZodNullable<z.ZodNumber>;
                count: z.ZodNullable<z.ZodNumber>;
                until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>;
                byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                    ordinal: z.ZodNullable<z.ZodNumber>;
                    weekday: z.ZodEnum<{
                        MO: "MO";
                        TU: "TU";
                        WE: "WE";
                        TH: "TH";
                        FR: "FR";
                        SA: "SA";
                        SU: "SU";
                    }>;
                }, z.core.$strict>>>>;
                weekStart: z.ZodNullable<z.ZodEnum<{
                    MO: "MO";
                    TU: "TU";
                    WE: "WE";
                    TH: "TH";
                    FR: "FR";
                    SA: "SA";
                    SU: "SU";
                }>>;
            }, z.core.$strict>>;
            rDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>>;
            exDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>>;
        }, z.core.$strict>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    issues: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            field_not_found: "field_not_found";
            field_incomplete: "field_incomplete";
            field_ambiguous: "field_ambiguous";
            field_conflicting: "field_conflicting";
            invalid_url: "invalid_url";
            invalid_date: "invalid_date";
            invalid_time: "invalid_time";
            invalid_time_zone: "invalid_time_zone";
            invalid_duration: "invalid_duration";
            missing_start: "missing_start";
            missing_year: "missing_year";
            unknown_all_day: "unknown_all_day";
            floating_time: "floating_time";
            dst_gap: "dst_gap";
            dst_fold: "dst_fold";
            offset_mismatch: "offset_mismatch";
            end_before_start: "end_before_start";
            end_duration_conflict: "end_duration_conflict";
            incompatible_temporal_kinds: "incompatible_temporal_kinds";
            invalid_recurrence: "invalid_recurrence";
            unsupported_recurrence: "unsupported_recurrence";
            missing_export_uid: "missing_export_uid";
            invalid_dtstamp: "invalid_dtstamp";
            invalid_prodid: "invalid_prodid";
            malformed_ics: "malformed_ics";
        }>;
        kind: z.ZodEnum<{
            not_found: "not_found";
            incomplete: "incomplete";
            ambiguous: "ambiguous";
            conflicting: "conflicting";
            invalid: "invalid";
            unsupported: "unsupported";
        }>;
        severity: z.ZodEnum<{
            blocker: "blocker";
            warning: "warning";
        }>;
        field: z.ZodUnion<readonly [z.ZodEnum<{
            sourceUid: "sourceUid";
            title: "title";
            description: "description";
            location: "location";
            url: "url";
            temporal: "temporal";
            recurrence: "recurrence";
        }>, z.ZodLiteral<"candidate">, z.ZodLiteral<"scan">]>;
        message: z.ZodString;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export type CandidateObservation = z.infer<typeof CandidateObservationSchema>;
export declare const EventCandidateSchema: z.ZodReadonly<z.ZodObject<{
    sourceUid: z.ZodNullable<z.ZodString>;
    title: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    description: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    location: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    url: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    temporal: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
            start: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>;
            end: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>;
            duration: z.ZodNullable<z.ZodString>;
            allDay: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"unknown">]>;
        }, z.core.$strict>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    recurrence: z.ZodReadonly<z.ZodObject<{
        value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
            rule: z.ZodReadonly<z.ZodObject<{
                frequency: z.ZodEnum<{
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    MONTHLY: "MONTHLY";
                    YEARLY: "YEARLY";
                }>;
                interval: z.ZodNullable<z.ZodNumber>;
                count: z.ZodNullable<z.ZodNumber>;
                until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>;
                byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                    ordinal: z.ZodNullable<z.ZodNumber>;
                    weekday: z.ZodEnum<{
                        MO: "MO";
                        TU: "TU";
                        WE: "WE";
                        TH: "TH";
                        FR: "FR";
                        SA: "SA";
                        SU: "SU";
                    }>;
                }, z.core.$strict>>>>;
                weekStart: z.ZodNullable<z.ZodEnum<{
                    MO: "MO";
                    TU: "TU";
                    WE: "WE";
                    TH: "TH";
                    FR: "FR";
                    SA: "SA";
                    SU: "SU";
                }>>;
            }, z.core.$strict>>;
            rDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>>;
            exDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"date">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNumber;
                day: z.ZodNumber;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"floating">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"zoned">;
                date: z.ZodReadonly<z.ZodObject<{
                    year: z.ZodNumber;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>;
                time: z.ZodReadonly<z.ZodObject<{
                    hour: z.ZodNumber;
                    minute: z.ZodNumber;
                    second: z.ZodNumber;
                }, z.core.$strict>>;
                timeZone: z.ZodString;
                resolution: z.ZodEnum<{
                    exact: "exact";
                    gap: "gap";
                    fold: "fold";
                    offset_resolved: "offset_resolved";
                }>;
                possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                sourceOffset: z.ZodNullable<z.ZodString>;
                chosenOffset: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                kind: z.ZodLiteral<"partial">;
                year: z.ZodNullable<z.ZodNumber>;
                month: z.ZodNullable<z.ZodNumber>;
                day: z.ZodNullable<z.ZodNumber>;
                hour: z.ZodNullable<z.ZodNumber>;
                minute: z.ZodNullable<z.ZodNumber>;
                second: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>], "kind">>>;
        }, z.core.$strict>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>;
    issues: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            field_not_found: "field_not_found";
            field_incomplete: "field_incomplete";
            field_ambiguous: "field_ambiguous";
            field_conflicting: "field_conflicting";
            invalid_url: "invalid_url";
            invalid_date: "invalid_date";
            invalid_time: "invalid_time";
            invalid_time_zone: "invalid_time_zone";
            invalid_duration: "invalid_duration";
            missing_start: "missing_start";
            missing_year: "missing_year";
            unknown_all_day: "unknown_all_day";
            floating_time: "floating_time";
            dst_gap: "dst_gap";
            dst_fold: "dst_fold";
            offset_mismatch: "offset_mismatch";
            end_before_start: "end_before_start";
            end_duration_conflict: "end_duration_conflict";
            incompatible_temporal_kinds: "incompatible_temporal_kinds";
            invalid_recurrence: "invalid_recurrence";
            unsupported_recurrence: "unsupported_recurrence";
            missing_export_uid: "missing_export_uid";
            invalid_dtstamp: "invalid_dtstamp";
            invalid_prodid: "invalid_prodid";
            malformed_ics: "malformed_ics";
        }>;
        kind: z.ZodEnum<{
            not_found: "not_found";
            incomplete: "incomplete";
            ambiguous: "ambiguous";
            conflicting: "conflicting";
            invalid: "invalid";
            unsupported: "unsupported";
        }>;
        severity: z.ZodEnum<{
            blocker: "blocker";
            warning: "warning";
        }>;
        field: z.ZodUnion<readonly [z.ZodEnum<{
            sourceUid: "sourceUid";
            title: "title";
            description: "description";
            location: "location";
            url: "url";
            temporal: "temporal";
            recurrence: "recurrence";
        }>, z.ZodLiteral<"candidate">, z.ZodLiteral<"scan">]>;
        message: z.ZodString;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>>>;
    candidateId: z.ZodString;
}, z.core.$strict>>;
export type EventCandidate = z.infer<typeof EventCandidateSchema>;
export declare const SourceHandleSchema: z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"text">;
    contentHandle: z.ZodString;
}, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"link">;
    contentHandle: z.ZodString;
}, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"image">;
    contentHandle: z.ZodString;
}, z.core.$strict>>], "kind">;
export type SourceHandle = z.infer<typeof SourceHandleSchema>;
export declare const ProviderScanObservationSchema: z.ZodReadonly<z.ZodObject<{
    candidates: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        sourceUid: z.ZodNullable<z.ZodString>;
        title: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        description: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        location: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        url: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        temporal: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
                start: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>;
                end: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>;
                duration: z.ZodNullable<z.ZodString>;
                allDay: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"unknown">]>;
            }, z.core.$strict>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        recurrence: z.ZodReadonly<z.ZodObject<{
            value: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
                rule: z.ZodReadonly<z.ZodObject<{
                    frequency: z.ZodEnum<{
                        DAILY: "DAILY";
                        WEEKLY: "WEEKLY";
                        MONTHLY: "MONTHLY";
                        YEARLY: "YEARLY";
                    }>;
                    interval: z.ZodNullable<z.ZodNumber>;
                    count: z.ZodNullable<z.ZodNumber>;
                    until: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                        kind: z.ZodLiteral<"date">;
                        year: z.ZodNullable<z.ZodNumber>;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                        kind: z.ZodLiteral<"floating">;
                        date: z.ZodReadonly<z.ZodObject<{
                            year: z.ZodNumber;
                            month: z.ZodNumber;
                            day: z.ZodNumber;
                        }, z.core.$strict>>;
                        time: z.ZodReadonly<z.ZodObject<{
                            hour: z.ZodNumber;
                            minute: z.ZodNumber;
                            second: z.ZodNumber;
                        }, z.core.$strict>>;
                    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                        kind: z.ZodLiteral<"zoned">;
                        date: z.ZodReadonly<z.ZodObject<{
                            year: z.ZodNumber;
                            month: z.ZodNumber;
                            day: z.ZodNumber;
                        }, z.core.$strict>>;
                        time: z.ZodReadonly<z.ZodObject<{
                            hour: z.ZodNumber;
                            minute: z.ZodNumber;
                            second: z.ZodNumber;
                        }, z.core.$strict>>;
                        timeZone: z.ZodString;
                        resolution: z.ZodEnum<{
                            exact: "exact";
                            gap: "gap";
                            fold: "fold";
                            offset_resolved: "offset_resolved";
                        }>;
                        possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                        sourceOffset: z.ZodNullable<z.ZodString>;
                        chosenOffset: z.ZodNullable<z.ZodString>;
                    }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                        kind: z.ZodLiteral<"partial">;
                        year: z.ZodNullable<z.ZodNumber>;
                        month: z.ZodNullable<z.ZodNumber>;
                        day: z.ZodNullable<z.ZodNumber>;
                        hour: z.ZodNullable<z.ZodNumber>;
                        minute: z.ZodNullable<z.ZodNumber>;
                        second: z.ZodNullable<z.ZodNumber>;
                    }, z.core.$strict>>], "kind">>;
                    byMonth: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                    byMonthDay: z.ZodReadonly<z.ZodArray<z.ZodNumber>>;
                    byDay: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                        ordinal: z.ZodNullable<z.ZodNumber>;
                        weekday: z.ZodEnum<{
                            MO: "MO";
                            TU: "TU";
                            WE: "WE";
                            TH: "TH";
                            FR: "FR";
                            SA: "SA";
                            SU: "SU";
                        }>;
                    }, z.core.$strict>>>>;
                    weekStart: z.ZodNullable<z.ZodEnum<{
                        MO: "MO";
                        TU: "TU";
                        WE: "WE";
                        TH: "TH";
                        FR: "FR";
                        SA: "SA";
                        SU: "SU";
                    }>>;
                }, z.core.$strict>>;
                rDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>>;
                exDates: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"date">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNumber;
                    day: z.ZodNumber;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"floating">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"zoned">;
                    date: z.ZodReadonly<z.ZodObject<{
                        year: z.ZodNumber;
                        month: z.ZodNumber;
                        day: z.ZodNumber;
                    }, z.core.$strict>>;
                    time: z.ZodReadonly<z.ZodObject<{
                        hour: z.ZodNumber;
                        minute: z.ZodNumber;
                        second: z.ZodNumber;
                    }, z.core.$strict>>;
                    timeZone: z.ZodString;
                    resolution: z.ZodEnum<{
                        exact: "exact";
                        gap: "gap";
                        fold: "fold";
                        offset_resolved: "offset_resolved";
                    }>;
                    possibleOffsets: z.ZodReadonly<z.ZodArray<z.ZodString>>;
                    sourceOffset: z.ZodNullable<z.ZodString>;
                    chosenOffset: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>, z.ZodReadonly<z.ZodObject<{
                    kind: z.ZodLiteral<"partial">;
                    year: z.ZodNullable<z.ZodNumber>;
                    month: z.ZodNullable<z.ZodNumber>;
                    day: z.ZodNullable<z.ZodNumber>;
                    hour: z.ZodNullable<z.ZodNumber>;
                    minute: z.ZodNullable<z.ZodNumber>;
                    second: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>], "kind">>>;
            }, z.core.$strict>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>;
        issues: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            code: z.ZodEnum<{
                field_not_found: "field_not_found";
                field_incomplete: "field_incomplete";
                field_ambiguous: "field_ambiguous";
                field_conflicting: "field_conflicting";
                invalid_url: "invalid_url";
                invalid_date: "invalid_date";
                invalid_time: "invalid_time";
                invalid_time_zone: "invalid_time_zone";
                invalid_duration: "invalid_duration";
                missing_start: "missing_start";
                missing_year: "missing_year";
                unknown_all_day: "unknown_all_day";
                floating_time: "floating_time";
                dst_gap: "dst_gap";
                dst_fold: "dst_fold";
                offset_mismatch: "offset_mismatch";
                end_before_start: "end_before_start";
                end_duration_conflict: "end_duration_conflict";
                incompatible_temporal_kinds: "incompatible_temporal_kinds";
                invalid_recurrence: "invalid_recurrence";
                unsupported_recurrence: "unsupported_recurrence";
                missing_export_uid: "missing_export_uid";
                invalid_dtstamp: "invalid_dtstamp";
                invalid_prodid: "invalid_prodid";
                malformed_ics: "malformed_ics";
            }>;
            kind: z.ZodEnum<{
                not_found: "not_found";
                incomplete: "incomplete";
                ambiguous: "ambiguous";
                conflicting: "conflicting";
                invalid: "invalid";
                unsupported: "unsupported";
            }>;
            severity: z.ZodEnum<{
                blocker: "blocker";
                warning: "warning";
            }>;
            field: z.ZodUnion<readonly [z.ZodEnum<{
                sourceUid: "sourceUid";
                title: "title";
                description: "description";
                location: "location";
                url: "url";
                temporal: "temporal";
                recurrence: "recurrence";
            }>, z.ZodLiteral<"candidate">, z.ZodLiteral<"scan">]>;
            message: z.ZodString;
            evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
                sourceId: z.ZodString;
                locator: z.ZodNullable<z.ZodString>;
                excerpt: z.ZodNullable<z.ZodString>;
                startOffset: z.ZodNullable<z.ZodNumber>;
                endOffset: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>>>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>>>;
    issues: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        code: z.ZodEnum<{
            field_not_found: "field_not_found";
            field_incomplete: "field_incomplete";
            field_ambiguous: "field_ambiguous";
            field_conflicting: "field_conflicting";
            invalid_url: "invalid_url";
            invalid_date: "invalid_date";
            invalid_time: "invalid_time";
            invalid_time_zone: "invalid_time_zone";
            invalid_duration: "invalid_duration";
            missing_start: "missing_start";
            missing_year: "missing_year";
            unknown_all_day: "unknown_all_day";
            floating_time: "floating_time";
            dst_gap: "dst_gap";
            dst_fold: "dst_fold";
            offset_mismatch: "offset_mismatch";
            end_before_start: "end_before_start";
            end_duration_conflict: "end_duration_conflict";
            incompatible_temporal_kinds: "incompatible_temporal_kinds";
            invalid_recurrence: "invalid_recurrence";
            unsupported_recurrence: "unsupported_recurrence";
            missing_export_uid: "missing_export_uid";
            invalid_dtstamp: "invalid_dtstamp";
            invalid_prodid: "invalid_prodid";
            malformed_ics: "malformed_ics";
        }>;
        kind: z.ZodEnum<{
            not_found: "not_found";
            incomplete: "incomplete";
            ambiguous: "ambiguous";
            conflicting: "conflicting";
            invalid: "invalid";
            unsupported: "unsupported";
        }>;
        severity: z.ZodEnum<{
            blocker: "blocker";
            warning: "warning";
        }>;
        field: z.ZodUnion<readonly [z.ZodEnum<{
            sourceUid: "sourceUid";
            title: "title";
            description: "description";
            location: "location";
            url: "url";
            temporal: "temporal";
            recurrence: "recurrence";
        }>, z.ZodLiteral<"candidate">, z.ZodLiteral<"scan">]>;
        message: z.ZodString;
        evidence: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
            sourceId: z.ZodString;
            locator: z.ZodNullable<z.ZodString>;
            excerpt: z.ZodNullable<z.ZodString>;
            startOffset: z.ZodNullable<z.ZodNumber>;
            endOffset: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>>>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export type ProviderScanObservation = z.infer<typeof ProviderScanObservationSchema>;
//# sourceMappingURL=contracts.d.ts.map