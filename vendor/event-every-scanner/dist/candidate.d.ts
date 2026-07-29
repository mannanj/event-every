import { type CandidateObservation, type EventCandidate } from "./contracts.js";
export type CandidateIdFactory = () => string;
export declare function createCandidate(observation: CandidateObservation, candidateIdFactory: CandidateIdFactory): EventCandidate;
//# sourceMappingURL=candidate.d.ts.map