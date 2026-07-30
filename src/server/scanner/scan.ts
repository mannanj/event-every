import {
  candidatesFromProviderObservation,
  EventCandidateSchema,
  sortIssues,
  type CandidateIdFactory,
  type EventCandidate,
  type ScannerIssue,
  type SourceHandle,
  type TextLinkProviderPort,
  type VisionProviderPort,
} from '@event-every/scanner';

export type HostScanJob =
  | Readonly<{
      kind: 'text';
      handle: Extract<SourceHandle, { kind: 'text' }>;
      provider: TextLinkProviderPort;
    }>
  | Readonly<{
      kind: 'image';
      handle: Extract<SourceHandle, { kind: 'image' }>;
      provider: VisionProviderPort;
    }>;

export type HostScanResult = Readonly<{
  candidates: readonly EventCandidate[];
  issues: readonly ScannerIssue[];
}>;

export async function scanSource(
  job: HostScanJob,
  dependencies: Readonly<{
    candidateIdFactory: CandidateIdFactory;
  }>,
): Promise<HostScanResult> {
  const observation = job.kind === 'text'
    ? await job.provider.scan([job.handle])
    : await job.provider.scan([job.handle]);
  const converted = candidatesFromProviderObservation(observation, dependencies.candidateIdFactory);

  return {
    candidates: converted.candidates.map((candidate) => EventCandidateSchema.parse(candidate)),
    issues: sortIssues(converted.issues),
  };
}
