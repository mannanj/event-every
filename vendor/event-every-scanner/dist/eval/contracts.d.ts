import { z } from "zod";
export declare const EvalProvenanceSchema: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"synthetic">;
    generator: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    origin: z.ZodLiteral<"public_domain">;
    sourceUrl: z.ZodString;
    license: z.ZodString;
}, z.core.$strict>], "origin">>;
export declare const EvalSourceSchema: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"text">;
    text: z.ZodString;
    provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"synthetic">;
        generator: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"public_domain">;
        sourceUrl: z.ZodString;
        license: z.ZodString;
    }, z.core.$strict>], "origin">>;
}, z.core.$strict>, z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"link">;
    text: z.ZodString;
    canonicalUrl: z.ZodNullable<z.ZodString>;
    provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"synthetic">;
        generator: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"public_domain">;
        sourceUrl: z.ZodString;
        license: z.ZodString;
    }, z.core.$strict>], "origin">>;
}, z.core.$strict>, z.ZodObject<{
    sourceId: z.ZodString;
    kind: z.ZodLiteral<"image">;
    fixturePath: z.ZodString;
    mediaType: z.ZodEnum<{
        "image/png": "image/png";
        "image/jpeg": "image/jpeg";
        "image/webp": "image/webp";
    }>;
    fixtureSha256: z.ZodString;
    provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"synthetic">;
        generator: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"public_domain">;
        sourceUrl: z.ZodString;
        license: z.ZodString;
    }, z.core.$strict>], "origin">>;
}, z.core.$strict>], "kind">>;
export declare const EvalCaseSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    caseId: z.ZodString;
    description: z.ZodString;
    kind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sources: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
        sourceId: z.ZodString;
        kind: z.ZodLiteral<"text">;
        text: z.ZodString;
        provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
            origin: z.ZodLiteral<"synthetic">;
            generator: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            origin: z.ZodLiteral<"public_domain">;
            sourceUrl: z.ZodString;
            license: z.ZodString;
        }, z.core.$strict>], "origin">>;
    }, z.core.$strict>, z.ZodObject<{
        sourceId: z.ZodString;
        kind: z.ZodLiteral<"link">;
        text: z.ZodString;
        canonicalUrl: z.ZodNullable<z.ZodString>;
        provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
            origin: z.ZodLiteral<"synthetic">;
            generator: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            origin: z.ZodLiteral<"public_domain">;
            sourceUrl: z.ZodString;
            license: z.ZodString;
        }, z.core.$strict>], "origin">>;
    }, z.core.$strict>, z.ZodObject<{
        sourceId: z.ZodString;
        kind: z.ZodLiteral<"image">;
        fixturePath: z.ZodString;
        mediaType: z.ZodEnum<{
            "image/png": "image/png";
            "image/jpeg": "image/jpeg";
            "image/webp": "image/webp";
        }>;
        fixtureSha256: z.ZodString;
        provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
            origin: z.ZodLiteral<"synthetic">;
            generator: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            origin: z.ZodLiteral<"public_domain">;
            sourceUrl: z.ZodString;
            license: z.ZodString;
        }, z.core.$strict>], "origin">>;
    }, z.core.$strict>], "kind">>>>;
    expected: z.ZodReadonly<z.ZodObject<{
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
    tags: z.ZodReadonly<z.ZodArray<z.ZodString>>;
}, z.core.$strict>>;
export declare const EvalCorpusSchema: z.ZodReadonly<z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    corpusId: z.ZodString;
    corpusVersion: z.ZodString;
    cases: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        caseId: z.ZodString;
        description: z.ZodString;
        kind: z.ZodEnum<{
            text_link: "text_link";
            vision: "vision";
        }>;
        sources: z.ZodReadonly<z.ZodArray<z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
            sourceId: z.ZodString;
            kind: z.ZodLiteral<"text">;
            text: z.ZodString;
            provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
                origin: z.ZodLiteral<"synthetic">;
                generator: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                origin: z.ZodLiteral<"public_domain">;
                sourceUrl: z.ZodString;
                license: z.ZodString;
            }, z.core.$strict>], "origin">>;
        }, z.core.$strict>, z.ZodObject<{
            sourceId: z.ZodString;
            kind: z.ZodLiteral<"link">;
            text: z.ZodString;
            canonicalUrl: z.ZodNullable<z.ZodString>;
            provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
                origin: z.ZodLiteral<"synthetic">;
                generator: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                origin: z.ZodLiteral<"public_domain">;
                sourceUrl: z.ZodString;
                license: z.ZodString;
            }, z.core.$strict>], "origin">>;
        }, z.core.$strict>, z.ZodObject<{
            sourceId: z.ZodString;
            kind: z.ZodLiteral<"image">;
            fixturePath: z.ZodString;
            mediaType: z.ZodEnum<{
                "image/png": "image/png";
                "image/jpeg": "image/jpeg";
                "image/webp": "image/webp";
            }>;
            fixtureSha256: z.ZodString;
            provenance: z.ZodReadonly<z.ZodDiscriminatedUnion<[z.ZodObject<{
                origin: z.ZodLiteral<"synthetic">;
                generator: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                origin: z.ZodLiteral<"public_domain">;
                sourceUrl: z.ZodString;
                license: z.ZodString;
            }, z.core.$strict>], "origin">>;
        }, z.core.$strict>], "kind">>>>;
        expected: z.ZodReadonly<z.ZodObject<{
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
        tags: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>>>;
}, z.core.$strict>>;
export type EvalProvenance = z.infer<typeof EvalProvenanceSchema>;
export type EvalSource = z.infer<typeof EvalSourceSchema>;
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalCorpus = z.infer<typeof EvalCorpusSchema>;
//# sourceMappingURL=contracts.d.ts.map