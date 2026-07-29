import { CandidateObservationSchema, EventCandidateSchema, } from "./contracts.js";
import { deduplicateIssues, issuesForMissingClaims, sortIssues, } from "./issues.js";
export function createCandidate(observation, candidateIdFactory) {
    const parsed = CandidateObservationSchema.parse(observation);
    const issues = sortIssues(deduplicateIssues([
        ...parsed.issues,
        ...issuesForMissingClaims(parsed),
    ]));
    return EventCandidateSchema.parse({
        candidateId: candidateIdFactory(),
        sourceUid: parsed.sourceUid,
        title: parsed.title,
        description: parsed.description,
        location: parsed.location,
        url: parsed.url,
        temporal: parsed.temporal,
        recurrence: parsed.recurrence,
        issues,
    });
}
//# sourceMappingURL=candidate.js.map