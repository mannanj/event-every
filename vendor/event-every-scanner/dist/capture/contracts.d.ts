import { z } from "zod";
import { type ProviderScanObservation } from "../contracts.js";
export declare const CaptureEligibilityInputSchema: z.ZodObject<{
    authentication: z.ZodLiteral<"verified_email">;
    email: z.ZodString;
    subjectId: z.ZodString;
    sessionId: z.ZodString;
}, z.core.$strict>;
export declare const SnapshotBindingSchema: z.ZodObject<{
    snapshotBindingVersion: z.ZodLiteral<1>;
    macKeyVersion: z.ZodNumber;
    value: z.ZodString;
}, z.core.$strict>;
export declare const CaptureStateSchema: z.ZodEnum<{
    preparing: "preparing";
    prepared: "prepared";
    provider_inflight: "provider_inflight";
    completed: "completed";
    scan_failed: "scan_failed";
    scan_outcome_unknown: "scan_outcome_unknown";
    reviewed: "reviewed";
    promoted: "promoted";
    rejected: "rejected";
    deletion_pending: "deletion_pending";
    deleted: "deleted";
}>;
export declare const GoldenStateSchema: z.ZodEnum<{
    active: "active";
    retirement_pending: "retirement_pending";
    retired: "retired";
}>;
export declare const RouteKindSchema: z.ZodEnum<{
    text_link: "text_link";
    vision: "vision";
}>;
export declare const ObjectClassSchema: z.ZodEnum<{
    capture_source: "capture_source";
    capture_outcome: "capture_outcome";
    private_golden: "private_golden";
    private_eval_report: "private_eval_report";
    private_screenshot: "private_screenshot";
    private_markdown_report: "private_markdown_report";
}>;
export declare const CaptureActionSchema: z.ZodEnum<{
    reject: "reject";
    create_intent: "create_intent";
    commit_source: "commit_source";
    claim_admission: "claim_admission";
    record_success: "record_success";
    record_failure: "record_failure";
    expire_unknown_call: "expire_unknown_call";
    mark_reviewed: "mark_reviewed";
    request_deletion: "request_deletion";
    finish_deletion: "finish_deletion";
    request_retirement: "request_retirement";
    finish_retirement: "finish_retirement";
    list_summaries: "list_summaries";
    decrypt_open: "decrypt_open";
    extend_retention: "extend_retention";
    delete_derivatives: "delete_derivatives";
    re_encrypt: "re_encrypt";
    retire_key: "retire_key";
    reconcile: "reconcile";
}>;
export declare const CapabilitySchema: z.ZodEnum<{
    "capture.review": "capture.review";
    "capture.retain": "capture.retain";
    "capture.delete": "capture.delete";
    "capture.delete_derivatives": "capture.delete_derivatives";
    "capture.key_admin": "capture.key_admin";
    "capture.reconcile": "capture.reconcile";
}>;
export declare const AuditActionSchema: z.ZodEnum<{
    capture_prepare: "capture_prepare";
    capture_claim_admission: "capture_claim_admission";
    capture_record_success: "capture_record_success";
    capture_record_failure: "capture_record_failure";
    capture_list: "capture_list";
    capture_decrypt: "capture_decrypt";
    capture_review: "capture_review";
    capture_promote: "capture_promote";
    capture_reject: "capture_reject";
    capture_retention_extend: "capture_retention_extend";
    capture_delete: "capture_delete";
    capture_delete_derivatives: "capture_delete_derivatives";
    capture_reencrypt: "capture_reencrypt";
    capture_retire_key: "capture_retire_key";
    capture_reconcile: "capture_reconcile";
    golden_retire: "golden_retire";
}>;
export declare const CaptureFailureCodeSchema: z.ZodEnum<{
    capture_invalid_input: "capture_invalid_input";
    capture_unavailable: "capture_unavailable";
    capture_unauthorized: "capture_unauthorized";
    capture_idempotency_conflict: "capture_idempotency_conflict";
    capture_binding_mismatch: "capture_binding_mismatch";
    capture_state_conflict: "capture_state_conflict";
    capture_generation_conflict: "capture_generation_conflict";
    capture_delete_incomplete: "capture_delete_incomplete";
    capture_corrupt: "capture_corrupt";
    capture_confirmation_invalid: "capture_confirmation_invalid";
    capture_provider_failed: "capture_provider_failed";
    capture_outcome_unknown: "capture_outcome_unknown";
    provider_outcome_uncertain: "provider_outcome_uncertain";
    outcome_record_unavailable: "outcome_record_unavailable";
}>;
export declare const CaptureHttpStatusSchema: z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<401>, z.ZodLiteral<403>, z.ZodLiteral<404>, z.ZodLiteral<409>, z.ZodLiteral<413>, z.ZodLiteral<429>, z.ZodLiteral<500>, z.ZodLiteral<502>, z.ZodLiteral<503>, z.ZodLiteral<504>]>;
export declare const CaptureFailureSchema: z.ZodObject<{
    code: z.ZodEnum<{
        capture_invalid_input: "capture_invalid_input";
        capture_unavailable: "capture_unavailable";
        capture_unauthorized: "capture_unauthorized";
        capture_idempotency_conflict: "capture_idempotency_conflict";
        capture_binding_mismatch: "capture_binding_mismatch";
        capture_state_conflict: "capture_state_conflict";
        capture_generation_conflict: "capture_generation_conflict";
        capture_delete_incomplete: "capture_delete_incomplete";
        capture_corrupt: "capture_corrupt";
        capture_confirmation_invalid: "capture_confirmation_invalid";
        capture_provider_failed: "capture_provider_failed";
        capture_outcome_unknown: "capture_outcome_unknown";
        provider_outcome_uncertain: "provider_outcome_uncertain";
        outcome_record_unavailable: "outcome_record_unavailable";
    }>;
    retryable: z.ZodBoolean;
    httpStatus: z.ZodUnion<[z.ZodUnion<readonly [z.ZodLiteral<400>, z.ZodLiteral<401>, z.ZodLiteral<403>, z.ZodLiteral<404>, z.ZodLiteral<409>, z.ZodLiteral<413>, z.ZodLiteral<429>, z.ZodLiteral<500>, z.ZodLiteral<502>, z.ZodLiteral<503>, z.ZodLiteral<504>]>, z.ZodNull]>;
}, z.core.$strict>;
export declare const EncryptedArtifactMetadataSchema: z.ZodObject<{
    objectId: z.ZodString;
    objectHandle: z.ZodString;
    objectClass: z.ZodEnum<{
        capture_source: "capture_source";
        capture_outcome: "capture_outcome";
        private_golden: "private_golden";
        private_eval_report: "private_eval_report";
        private_screenshot: "private_screenshot";
        private_markdown_report: "private_markdown_report";
    }>;
    schemaVersion: z.ZodNumber;
    keyVersion: z.ZodNumber;
    generation: z.ZodNumber;
    ciphertextSha256: z.ZodString;
    ciphertextLength: z.ZodNumber;
}, z.core.$strict>;
export declare const CaptureReceiptSchema: z.ZodObject<{
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    snapshotHandle: z.ZodString;
    snapshotBinding: z.ZodObject<{
        snapshotBindingVersion: z.ZodLiteral<1>;
        macKeyVersion: z.ZodNumber;
        value: z.ZodString;
    }, z.core.$strict>;
    routeKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    schemaVersion: z.ZodNumber;
    state: z.ZodEnum<{
        preparing: "preparing";
        prepared: "prepared";
        provider_inflight: "provider_inflight";
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
        reviewed: "reviewed";
        promoted: "promoted";
        rejected: "rejected";
        deletion_pending: "deletion_pending";
        deleted: "deleted";
    }>;
    stateVersion: z.ZodNumber;
    operationId: z.ZodString;
    generation: z.ZodNumber;
    leaseExpiresAt: z.ZodString;
    executionId: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const CaptureCatalogRecordSchema: z.ZodUnion<readonly [z.ZodObject<{
    state: z.ZodLiteral<"preparing">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodEnum<{
        prepared: "prepared";
        provider_inflight: "provider_inflight";
    }>;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"reviewed">;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"promoted">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    completedAt: z.ZodString;
    reviewedAt: z.ZodString;
    promotedAt: z.ZodString;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodString;
    promoterSubjectRef: z.ZodString;
    goldenId: z.ZodString;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"prepared">;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodNull;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"reviewed">;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"preparing">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodEnum<{
        prepared: "prepared";
        provider_inflight: "provider_inflight";
    }>;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"reviewed">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"prepared">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"reviewed">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    rejectedAt: z.ZodString;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deletion_pending">;
    deletionFencedState: z.ZodLiteral<"promoted">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
        }>;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodNull;
    completedAt: z.ZodString;
    reviewedAt: z.ZodString;
    promotedAt: z.ZodString;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodString;
    promoterSubjectRef: z.ZodString;
    goldenId: z.ZodString;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    deletionFencedState: z.ZodLiteral<"preparing">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    state: z.ZodLiteral<"deleted">;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodEnum<{
        prepared: "prepared";
        provider_inflight: "provider_inflight";
    }>;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodLiteral<"reviewed">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    rejectedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"prepared">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    rejectedAt: z.ZodString;
    completedAt: z.ZodNull;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodEnum<{
        completed: "completed";
        scan_failed: "scan_failed";
        scan_outcome_unknown: "scan_outcome_unknown";
    }>;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    rejectedAt: z.ZodString;
    completedAt: z.ZodString;
    reviewedAt: z.ZodNull;
    promotedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodLiteral<"rejected">;
    rejectionFencedState: z.ZodLiteral<"reviewed">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    rejectedAt: z.ZodString;
    reviewedAt: z.ZodString;
    reviewerSubjectRef: z.ZodString;
    completedAt: z.ZodString;
    promotedAt: z.ZodNull;
    promoterSubjectRef: z.ZodNull;
    goldenId: z.ZodNull;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"deleted">;
    deletionFencedState: z.ZodLiteral<"promoted">;
    artifacts: z.ZodArray<z.ZodObject<{
        objectId: z.ZodString;
        objectHandle: z.ZodString;
        objectClass: z.ZodEnum<{
            capture_source: "capture_source";
            capture_outcome: "capture_outcome";
            private_golden: "private_golden";
            private_eval_report: "private_eval_report";
            private_screenshot: "private_screenshot";
            private_markdown_report: "private_markdown_report";
        }>;
        schemaVersion: z.ZodNumber;
        keyVersion: z.ZodNumber;
        generation: z.ZodNumber;
        ciphertextSha256: z.ZodString;
        ciphertextLength: z.ZodNumber;
    }, z.core.$strict>>;
    deletionRequestedAt: z.ZodString;
    deletedAt: z.ZodString;
    completedAt: z.ZodString;
    reviewedAt: z.ZodString;
    promotedAt: z.ZodString;
    rejectedAt: z.ZodNull;
    reviewerSubjectRef: z.ZodString;
    promoterSubjectRef: z.ZodString;
    goldenId: z.ZodString;
    captureId: z.ZodString;
    subjectRef: z.ZodString;
    stateVersion: z.ZodNumber;
    generation: z.ZodNumber;
    schemaVersion: z.ZodNumber;
    createdAt: z.ZodString;
    sourceKind: z.ZodEnum<{
        text_link: "text_link";
        vision: "vision";
    }>;
    sourceCount: z.ZodNumber;
    retentionDeadline: z.ZodString;
}, z.core.$strict>]>;
/** Every audit event belongs to exactly one private catalog entity. */
export declare const AuditEventSchema: z.ZodUnion<readonly [z.ZodObject<{
    captureId: z.ZodString;
    goldenId: z.ZodNull;
    eventId: z.ZodString;
    action: z.ZodEnum<{
        capture_prepare: "capture_prepare";
        capture_claim_admission: "capture_claim_admission";
        capture_record_success: "capture_record_success";
        capture_record_failure: "capture_record_failure";
        capture_list: "capture_list";
        capture_decrypt: "capture_decrypt";
        capture_review: "capture_review";
        capture_promote: "capture_promote";
        capture_reject: "capture_reject";
        capture_retention_extend: "capture_retention_extend";
        capture_delete: "capture_delete";
        capture_delete_derivatives: "capture_delete_derivatives";
        capture_reencrypt: "capture_reencrypt";
        capture_retire_key: "capture_retire_key";
        capture_reconcile: "capture_reconcile";
        golden_retire: "golden_retire";
    }>;
    occurredAt: z.ZodString;
    actorRef: z.ZodString;
    policyVersion: z.ZodNumber;
    operationId: z.ZodString;
    outcomeCode: z.ZodEnum<{
        success: "success";
        denied: "denied";
        failed: "failed";
        conflict: "conflict";
    }>;
}, z.core.$strict>, z.ZodObject<{
    captureId: z.ZodNull;
    goldenId: z.ZodString;
    eventId: z.ZodString;
    action: z.ZodEnum<{
        capture_prepare: "capture_prepare";
        capture_claim_admission: "capture_claim_admission";
        capture_record_success: "capture_record_success";
        capture_record_failure: "capture_record_failure";
        capture_list: "capture_list";
        capture_decrypt: "capture_decrypt";
        capture_review: "capture_review";
        capture_promote: "capture_promote";
        capture_reject: "capture_reject";
        capture_retention_extend: "capture_retention_extend";
        capture_delete: "capture_delete";
        capture_delete_derivatives: "capture_delete_derivatives";
        capture_reencrypt: "capture_reencrypt";
        capture_retire_key: "capture_retire_key";
        capture_reconcile: "capture_reconcile";
        golden_retire: "golden_retire";
    }>;
    occurredAt: z.ZodString;
    actorRef: z.ZodString;
    policyVersion: z.ZodNumber;
    operationId: z.ZodString;
    outcomeCode: z.ZodEnum<{
        success: "success";
        denied: "denied";
        failed: "failed";
        conflict: "conflict";
    }>;
}, z.core.$strict>]>;
declare const ReviewedCaptureProvenanceSchema: z.ZodReadonly<z.ZodObject<{
    origin: z.ZodLiteral<"reviewed_private_capture">;
    captureId: z.ZodString;
    reviewedAt: z.ZodString;
    reviewerRef: z.ZodString;
    policyVersion: z.ZodLiteral<1>;
}, z.core.$strict>>;
/** Strict, content-free binding for a reviewed private-capture promotion attempt. */
export declare const PromotionRequestSchema: z.ZodReadonly<z.ZodObject<{
    captureId: z.ZodString;
    goldenId: z.ZodString;
    reviewedSnapshotHandle: z.ZodString;
    reviewedContentBinding: z.ZodObject<{
        snapshotBindingVersion: z.ZodLiteral<1>;
        macKeyVersion: z.ZodNumber;
        value: z.ZodString;
    }, z.core.$strict>;
    expectedStateVersion: z.ZodNumber;
    expectedGeneration: z.ZodNumber;
    actorRef: z.ZodString;
    authorizationDecisionId: z.ZodString;
    idempotencyId: z.ZodString;
    auditEventId: z.ZodString;
    confirmationNonce: z.ZodString;
    createdArtifact: z.ZodReadonly<z.ZodObject<{
        objectHandle: z.ZodString;
        generation: z.ZodNumber;
        objectClass: z.ZodLiteral<"private_golden">;
        entityKind: z.ZodLiteral<"golden">;
        entityId: z.ZodString;
        createdByOperationId: z.ZodString;
        hostValidatedCleanupClaimId: z.ZodString;
    }, z.core.$strict>>;
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
    provenance: z.ZodReadonly<z.ZodObject<{
        origin: z.ZodLiteral<"reviewed_private_capture">;
        captureId: z.ZodString;
        reviewedAt: z.ZodString;
        reviewerRef: z.ZodString;
        policyVersion: z.ZodLiteral<1>;
    }, z.core.$strict>>;
}, z.core.$strict>>;
/**
 * The complete successful pair persisted by the host's promotion CAS.  An idempotent replay
 * returns this closed record verbatim; it never reconstructs a golden from a later lifecycle.
 */
export declare const PersistedReviewedCapturePromotionResultSchema: z.ZodReadonly<z.ZodObject<{
    promotion: z.ZodReadonly<z.ZodObject<{
        captureId: z.ZodString;
        goldenId: z.ZodString;
        idempotencyId: z.ZodString;
        auditEventId: z.ZodString;
        actorRef: z.ZodString;
        authorizationDecisionId: z.ZodString;
        occurredAt: z.ZodString;
    }, z.core.$strict>>;
    capture: z.ZodReadonly<z.ZodObject<{
        captureId: z.ZodString;
        state: z.ZodLiteral<"promoted">;
        stateVersion: z.ZodNumber;
        generation: z.ZodNumber;
        retentionDeadline: z.ZodString;
    }, z.core.$strict>>;
    golden: z.ZodReadonly<z.ZodObject<{
        goldenId: z.ZodString;
        captureId: z.ZodString;
        state: z.ZodLiteral<"active">;
        stateVersion: z.ZodLiteral<1>;
        generation: z.ZodLiteral<1>;
        artifact: z.ZodReadonly<z.ZodObject<{
            objectHandle: z.ZodString;
            generation: z.ZodNumber;
            objectClass: z.ZodLiteral<"private_golden">;
            entityKind: z.ZodLiteral<"golden">;
            entityId: z.ZodString;
            createdByOperationId: z.ZodString;
            hostValidatedCleanupClaimId: z.ZodString;
        }, z.core.$strict>>;
        retentionDeadline: z.ZodString;
    }, z.core.$strict>>;
    auditEvent: z.ZodUnion<readonly [z.ZodObject<{
        captureId: z.ZodString;
        goldenId: z.ZodNull;
        eventId: z.ZodString;
        action: z.ZodEnum<{
            capture_prepare: "capture_prepare";
            capture_claim_admission: "capture_claim_admission";
            capture_record_success: "capture_record_success";
            capture_record_failure: "capture_record_failure";
            capture_list: "capture_list";
            capture_decrypt: "capture_decrypt";
            capture_review: "capture_review";
            capture_promote: "capture_promote";
            capture_reject: "capture_reject";
            capture_retention_extend: "capture_retention_extend";
            capture_delete: "capture_delete";
            capture_delete_derivatives: "capture_delete_derivatives";
            capture_reencrypt: "capture_reencrypt";
            capture_retire_key: "capture_retire_key";
            capture_reconcile: "capture_reconcile";
            golden_retire: "golden_retire";
        }>;
        occurredAt: z.ZodString;
        actorRef: z.ZodString;
        policyVersion: z.ZodNumber;
        operationId: z.ZodString;
        outcomeCode: z.ZodEnum<{
            success: "success";
            denied: "denied";
            failed: "failed";
            conflict: "conflict";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        captureId: z.ZodNull;
        goldenId: z.ZodString;
        eventId: z.ZodString;
        action: z.ZodEnum<{
            capture_prepare: "capture_prepare";
            capture_claim_admission: "capture_claim_admission";
            capture_record_success: "capture_record_success";
            capture_record_failure: "capture_record_failure";
            capture_list: "capture_list";
            capture_decrypt: "capture_decrypt";
            capture_review: "capture_review";
            capture_promote: "capture_promote";
            capture_reject: "capture_reject";
            capture_retention_extend: "capture_retention_extend";
            capture_delete: "capture_delete";
            capture_delete_derivatives: "capture_delete_derivatives";
            capture_reencrypt: "capture_reencrypt";
            capture_retire_key: "capture_retire_key";
            capture_reconcile: "capture_reconcile";
            golden_retire: "golden_retire";
        }>;
        occurredAt: z.ZodString;
        actorRef: z.ZodString;
        policyVersion: z.ZodNumber;
        operationId: z.ZodString;
        outcomeCode: z.ZodEnum<{
            success: "success";
            denied: "denied";
            failed: "failed";
            conflict: "conflict";
        }>;
    }, z.core.$strict>]>;
    authorizationDecisionId: z.ZodString;
}, z.core.$strict>>;
export type CaptureEligibilityInput = z.infer<typeof CaptureEligibilityInputSchema>;
export type SnapshotBinding = z.infer<typeof SnapshotBindingSchema>;
export type CaptureState = z.infer<typeof CaptureStateSchema>;
export type GoldenState = z.infer<typeof GoldenStateSchema>;
export type CaptureAction = z.infer<typeof CaptureActionSchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type CaptureFailure = z.infer<typeof CaptureFailureSchema>;
export type EncryptedArtifactMetadata = z.infer<typeof EncryptedArtifactMetadataSchema>;
export type CaptureReceipt = z.infer<typeof CaptureReceiptSchema>;
export type CaptureCatalogRecord = z.infer<typeof CaptureCatalogRecordSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type PersistedReviewedCapturePromotionResult = z.infer<typeof PersistedReviewedCapturePromotionResultSchema>;
export type CaptureEligibilityDecision = Readonly<{
    kind: "eligible";
}> | Readonly<{
    kind: "not_eligible";
}> | Readonly<{
    kind: "invalid";
    failure: CaptureFailure;
}>;
export type PrepareCaptureRequest = Readonly<{
    subjectRef: string;
    snapshotHandle: string;
    snapshotBinding: SnapshotBinding;
    routeKind: "text_link" | "vision";
    schemaVersion: number;
    generation: number;
    operationId: string;
}>;
export type PrepareCaptureResult = Readonly<{
    kind: "prepared";
    receipt: CaptureReceipt;
}> | Readonly<{
    kind: "existing";
    receipt: CaptureReceipt;
}>;
export type ClaimProviderAdmissionRequest = Readonly<{
    captureId: string;
    subjectRef: string;
    snapshotHandle: string;
    snapshotBinding: SnapshotBinding;
    routeKind: "text_link" | "vision";
    schemaVersion: number;
    operationId: string;
    expectedState: "prepared";
    expectedStateVersion: number;
    expectedGeneration: number;
}>;
export type ClaimProviderAdmissionResult = Readonly<{
    kind: "claimed";
    receipt: CaptureReceipt & Readonly<{
        state: "provider_inflight";
        executionId: string;
    }>;
}> | Readonly<{
    kind: "existing";
    receipt: CaptureReceipt;
}>;
export type CapturedProviderRequest = Readonly<{
    captureId: string;
    executionId: string;
    snapshotHandle: string;
    snapshotBinding: SnapshotBinding;
    routeKind: "text_link" | "vision";
    /** Frozen receipt schema used by the provider to decode the immutable snapshot. */
    schemaVersion: number;
}>;
export type CapturedProviderResult = Readonly<{
    kind: "success";
    observation: ProviderScanObservation;
}> | Readonly<{
    kind: "failure";
    failure: Readonly<{
        code: "capture_provider_failed";
        retryable: boolean;
        httpStatus: CaptureFailure["httpStatus"];
    }>;
}>;
export type RecordCaptureOutcomeRequest = Readonly<{
    captureId: string;
    executionId: string;
    expectedStateVersion: number;
    expectedGeneration: number;
    operationId: string;
    outcome: CapturedProviderResult;
}>;
/** A fully host-derived request over an already frozen source snapshot. */
export type CapturedAdmissionInput = Readonly<{
    eligibility: CaptureEligibilityInput;
    subjectRef: string;
    snapshotHandle: string;
    snapshotBinding: SnapshotBinding;
    routeKind: "text_link" | "vision";
    schemaVersion: number;
    generation: number;
    operationId: string;
}>;
/** Closed, content-free result of one provider-admission attempt. */
export type CapturedAdmissionResult = Readonly<{
    kind: "invalid";
    failure: CaptureFailure;
}> | Readonly<{
    kind: "not_eligible";
}> | Readonly<{
    kind: "existing";
    receipt: CaptureReceipt;
}> | Readonly<{
    kind: "recorded";
    receipt: CaptureReceipt;
    outcome: CapturedProviderResult;
}> | Readonly<{
    kind: "failure";
    failure: CaptureFailure;
}>;
type ReviewedCaptureProvenance = z.infer<typeof ReviewedCaptureProvenanceSchema>;
export type PromotionRequest = z.infer<typeof PromotionRequestSchema>;
/**
 * The host supplies only the content-free reviewed receipt and closed source-id set.  A keyed
 * idempotency lookup, when present, carries the previously validated request verbatim.
 */
export type PromotionValidationContext = Readonly<{
    capture: CaptureReceipt;
    reviewedSourceIds: readonly string[];
    /** Authoritative review facts, never copied from the submitted provenance. */
    reviewedAt: string;
    reviewerRef: string;
    /** Authoritative timestamp for the promotion audit attempt. */
    promotionOccurredAt: string;
    existingPromotion: Readonly<{
        idempotencyId: string;
        request: PromotionRequest;
        reviewedSourceIds: readonly string[];
        /** Complete original result persisted atomically with the paired capture/golden CAS. */
        result: PersistedReviewedCapturePromotionResult;
    }> | null;
}>;
export type PromotionValidationResult = Readonly<{
    kind: "validated";
    request: PromotionRequest;
    goldenId: string;
    replayed: true;
    auditEvent: AuditEvent;
    authorizationDecisionId: string;
    auditPersistence: "already_persisted";
    persistedResult: PersistedReviewedCapturePromotionResult;
}> | Readonly<{
    kind: "validated";
    request: PromotionRequest;
    goldenId: null;
    replayed: false;
    auditEvent: AuditEvent;
    authorizationDecisionId: string;
    auditPersistence: "atomic_with_state_cas";
    persistedResult: null;
}> | Readonly<{
    kind: "failure";
    failure: CaptureFailure;
    auditEvent: AuditEvent | null;
    authorizationDecisionId: string | null;
    auditPersistence: "before_response" | "host_boundary";
}>;
/**
 * The only package-level reviewed-capture → golden change. Hosts persist its capture state,
 * golden state, and audit event in one CAS transaction; neither side has an independent promote.
 */
export type ReviewedCapturePromotionResult = (PersistedReviewedCapturePromotionResult & Readonly<{
    kind: "promoted";
    auditPersistence: "atomic_with_capture_and_golden_cas";
    replayed: false;
}>) | (PersistedReviewedCapturePromotionResult & Readonly<{
    kind: "promoted";
    auditPersistence: "already_persisted";
    replayed: true;
}>) | Readonly<{
    kind: "failure";
    failure: CaptureFailure;
    auditEvent: AuditEvent | null;
    authorizationDecisionId: string | null;
    auditPersistence: "before_response" | "host_boundary";
    cleanupObligation: Readonly<{
        kind: "claim_and_delete_host_validated_loser_artifact";
        hostValidatedCleanupClaimId: string;
    }> | null;
}>;
type GoldenReceiptBase = Readonly<{
    goldenId: string;
    captureId: string;
    reviewedSnapshotHandle: string;
    reviewedContentBinding: SnapshotBinding;
    provenance: ReviewedCaptureProvenance;
    stateVersion: number;
    generation: number;
    idempotencyId: string;
    retentionDeadline: string;
}>;
type ActiveGoldenReceipt = GoldenReceiptBase & Readonly<{
    state: "active";
    artifact: EncryptedArtifactMetadata;
    retiredAt: null;
}>;
type RetirementPendingGoldenReceipt = GoldenReceiptBase & Readonly<{
    state: "retirement_pending";
    artifact: EncryptedArtifactMetadata;
    retiredAt: null;
}>;
type RetiredGoldenReceipt = GoldenReceiptBase & Readonly<{
    state: "retired";
    artifact: null;
    retiredAt: string;
}>;
export type GoldenReceipt = ActiveGoldenReceipt | RetirementPendingGoldenReceipt | RetiredGoldenReceipt;
type ArtifactClaimBase = Readonly<{
    objectHandle: string;
    generation: number;
    objectClass: "capture_source" | "capture_outcome" | "private_golden";
    entityKind: "capture" | "golden";
    entityId: string;
}>;
/** Capture deletion may account only for capture-owned source and outcome ciphertext. */
type CaptureCatalogObjectClaim = ArtifactClaimBase & Readonly<{
    objectClass: "capture_source" | "capture_outcome";
    entityKind: "capture";
}>;
/** Golden retirement may account only for its own independently curated golden ciphertext. */
type GoldenCatalogObjectClaim = ArtifactClaimBase & Readonly<{
    objectClass: "private_golden";
    entityKind: "golden";
}>;
type ObjectAbsenceProof = "all_catalog_named_objects_absent" | null;
type CaptureTransitionBase<Action extends string, ExpectedState extends CaptureState | null> = Readonly<{
    captureId: string;
    action: Action;
    expectedState: ExpectedState;
    expectedStateVersion: number;
    expectedGeneration: number;
    idempotencyId: string;
    /** Host-generated random audit identity; policy validates and preserves it without generating entropy. */
    auditEventId: string;
}>;
type PrivilegedCaptureTransition<Action extends string, ExpectedState extends CaptureState> = CaptureTransitionBase<Action, ExpectedState> & Readonly<{
    actorRef: string;
    authorizationDecisionId: string;
}>;
type ConfirmedCaptureTransition<Action extends string, ExpectedState extends CaptureState> = PrivilegedCaptureTransition<Action, ExpectedState> & Readonly<{
    confirmationNonce: string;
}>;
/**
 * A host may construct this only after it has durably bound the immutable object to the exact
 * entity/action operation and minted an opaque cleanup claim.  The policy never treats that
 * opaque claim as an object handle: the host must resolve it fail-closed after checking that the
 * object remains unreferenced by every authoritative catalog row.
 */
type CreatedArtifactDeclaration<ObjectClass extends ArtifactClaimBase["objectClass"], EntityKind extends ArtifactClaimBase["entityKind"]> = ArtifactClaimBase & Readonly<{
    objectClass: ObjectClass;
    entityKind: EntityKind;
    createdByOperationId: string;
    hostValidatedCleanupClaimId: string;
}>;
type CaptureCreatedArtifact<ObjectClass extends ArtifactClaimBase["objectClass"]> = CreatedArtifactDeclaration<ObjectClass, "capture">;
type GoldenCreatedArtifact<ObjectClass extends ArtifactClaimBase["objectClass"]> = CreatedArtifactDeclaration<ObjectClass, "golden">;
/** Re-encryption may be a metadata-only key rotation and therefore create no object. */
type OptionalCaptureCreatedArtifact = CaptureCreatedArtifact<"capture_source" | "capture_outcome"> | null;
type OptionalGoldenCreatedArtifact = GoldenCreatedArtifact<"private_golden"> | null;
export type RetentionExtension = Readonly<{
    reason: "review_extension" | "legal_obligation" | "security_investigation";
    expiresAt: string;
}>;
type CaptureNonDeletedState = Exclude<CaptureState, "deleted">;
type BeforeDeletionFenceState = Exclude<CaptureState, "deletion_pending" | "deleted">;
type ReviewableCaptureState = "completed" | "scan_failed" | "scan_outcome_unknown";
type RejectableCaptureState = "prepared" | ReviewableCaptureState | "reviewed";
export type CaptureTransitionRequest = CaptureTransitionBase<"create_intent", null> | (CaptureTransitionBase<"commit_source", "preparing"> & Readonly<{
    createdArtifact: CaptureCreatedArtifact<"capture_source">;
}>) | CaptureTransitionBase<"claim_admission", "prepared"> | (CaptureTransitionBase<"record_success" | "record_failure", "provider_inflight"> & Readonly<{
    createdArtifact: CaptureCreatedArtifact<"capture_outcome">;
}>) | PrivilegedCaptureTransition<"expire_unknown_call", "provider_inflight"> | PrivilegedCaptureTransition<"mark_reviewed", ReviewableCaptureState> | ConfirmedCaptureTransition<"reject", RejectableCaptureState> | ConfirmedCaptureTransition<"request_deletion", CaptureNonDeletedState> | (PrivilegedCaptureTransition<"finish_deletion", "deletion_pending"> & Readonly<{
    objectAbsence: "all_catalog_named_objects_absent";
    objectAbsenceClaims?: readonly CaptureCatalogObjectClaim[];
}>) | (ConfirmedCaptureTransition<"extend_retention", CaptureNonDeletedState> & Readonly<{
    retention: RetentionExtension;
}>) | (ConfirmedCaptureTransition<"re_encrypt", BeforeDeletionFenceState> & Readonly<{
    createdArtifact: OptionalCaptureCreatedArtifact;
}>) | ConfirmedCaptureTransition<"retire_key", BeforeDeletionFenceState> | (PrivilegedCaptureTransition<"reconcile", CaptureNonDeletedState> & Readonly<{
    reconciliation?: "expired_or_inconsistent";
}>);
type GoldenTransitionBase = Readonly<{
    goldenId: string;
    expectedStateVersion: number;
    expectedGeneration: number;
    actorRef: string;
    authorizationDecisionId: string;
    idempotencyId: string;
    /** Host-generated random audit identity; policy validates and preserves it without generating entropy. */
    auditEventId: string;
    confirmationNonce: string;
}>;
export type GoldenTransitionRequest = (GoldenTransitionBase & Readonly<{
    action: "request_retirement";
    expectedState: "active";
    createdArtifact?: OptionalGoldenCreatedArtifact;
}>) | (GoldenTransitionBase & Readonly<{
    action: "finish_retirement";
    expectedState: "retirement_pending";
    objectAbsence: Exclude<ObjectAbsenceProof, null>;
    objectAbsenceClaims?: readonly GoldenCatalogObjectClaim[];
}>);
export type CaptureTransitionResult = Readonly<{
    ok: true;
    state: CaptureState;
    stateVersion: number;
    generation: number;
    retentionDeadline: string;
    leaseExpiresAt: string | null;
    auditEvent: AuditEvent;
    authorizationDecisionId: string | null;
    auditPersistence: "atomic_with_state_cas" | "already_persisted";
    replayed: boolean;
}> | Readonly<{
    ok: false;
    failure: CaptureFailure;
    auditEvent: AuditEvent | null;
    authorizationDecisionId: string | null;
    auditPersistence: "before_response" | "host_boundary";
    cleanupObligation: Readonly<{
        kind: "claim_and_delete_host_validated_loser_artifact";
        hostValidatedCleanupClaimId: string;
    }> | null;
}>;
export type GoldenTransitionResult = Readonly<{
    ok: true;
    state: GoldenState;
    stateVersion: number;
    generation: number;
    retentionDeadline: string;
    leaseExpiresAt: string | null;
    auditEvent: AuditEvent;
    authorizationDecisionId: string | null;
    auditPersistence: "atomic_with_state_cas" | "already_persisted";
    replayed: boolean;
}> | Readonly<{
    ok: false;
    failure: CaptureFailure;
    auditEvent: AuditEvent | null;
    authorizationDecisionId: string | null;
    auditPersistence: "before_response" | "host_boundary";
    cleanupObligation: Readonly<{
        kind: "claim_and_delete_host_validated_loser_artifact";
        hostValidatedCleanupClaimId: string;
    }> | null;
}>;
export type CaptureActionAuthorization = Readonly<{
    authorized: true;
    authorizationDecisionId: string;
    auditEvent: AuditEvent;
    auditPersistence: "before_private_data" | "atomic_with_state_cas";
}> | Readonly<{
    authorized: false;
    failure: CaptureFailure;
    authorizationDecisionId: string | null;
    auditEvent: AuditEvent | null;
    auditPersistence: "before_response" | "host_boundary";
}>;
export interface PrivateCaptureStore {
    prepare(input: PrepareCaptureRequest): Promise<PrepareCaptureResult>;
    claimProviderAdmission(input: ClaimProviderAdmissionRequest): Promise<ClaimProviderAdmissionResult>;
    recordOutcome(input: RecordCaptureOutcomeRequest): Promise<CaptureReceipt>;
    transition(input: CaptureTransitionRequest): Promise<CaptureReceipt & Readonly<{
        auditEvent: AuditEvent;
        auditPersistence: "atomic_with_state_cas";
    }>>;
}
export interface PrivateGoldenStore {
    /** Atomically persists the reviewed capture promotion, active golden, and returned audit event. */
    promote(input: PromotionRequest): Promise<ReviewedCapturePromotionResult>;
    retire(input: Extract<GoldenTransitionRequest, {
        action: "request_retirement" | "finish_retirement";
    }>): Promise<GoldenReceipt & Readonly<{
        auditEvent: AuditEvent;
        auditPersistence: "atomic_with_state_cas";
    }>>;
}
export interface CapturedProviderPort {
    call(input: CapturedProviderRequest): Promise<CapturedProviderResult>;
}
export {};
//# sourceMappingURL=contracts.d.ts.map