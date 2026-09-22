import type {
  OwnerBudgetBinding,
  ProviderBindingCandidate,
  ProviderRequestCompletionResult,
  ProviderRequestObservedResult,
  ProviderRequestPendingResult,
} from '@/platform/contracts';
import { ownerBudgetLedgerName } from '@/platform/provider/policy';
import {
  getProviderOperationContext,
  type DurableNamespaceLike,
  type OwnerBudgetAuthorityStub,
  type ProviderRequestAuthorityStub,
} from '@/platform/cloudflare-context';
import type { ProviderVariant } from '@/platform/provider/contracts';
import {
  OWNER_POLICY_VERSION,
  ownerBudgetLedgerName as ledgerName,
  ownerPolicyForVariant,
  SPEND_POLICIES,
  type SpendPolicyVersion,
} from '@/platform/provider/policy';
import { providerRequestName } from '@/platform/provider/request-binding';
import {
  callOpenRouter,
  type ConsumerKind,
  type ProviderInvocation,
  type ProviderTransportInput,
  type ProviderTransportResult,
} from '@/platform/provider/transport';

const CONSUMER_BY_VARIANT: Readonly<Record<ProviderVariant, ConsumerKind>> = Object.freeze({
  'scan-text': 'scan_text',
  'scan-image': 'scan_image',
  'resolve-timezone': 'resolve_timezone',
  summarize: 'summarize',
});

export type ProviderOperationResult =
  | ProviderRequestObservedResult
  | Readonly<{ status: 'conflict' }>
  | Readonly<{ status: 'budget-exhausted'; resetAt: string }>
  | Readonly<{ status: 'unavailable' }>;

export type ProviderOperationInput = Readonly<{
  requestId: string;
  variant: ProviderVariant;
  bindingCandidates: readonly ProviderBindingCandidate[];
  signal: AbortSignal;
  execute(invoke: ProviderInvocation): Promise<unknown>;
  /**
   * Which spending policy this request runs under, and therefore which ledger
   * it reserves from and which key it spends against.
   *
   * Defaults to the owner policy, so every existing caller is unchanged and a
   * signed-out visitor can never be anything else. Only /api/scan sets it, from
   * a session it has already read.
   */
  policyVersion?: SpendPolicyVersion;
}>;

export type ProviderOperationDependencies = Readonly<{
  requestAuthority: DurableNamespaceLike<ProviderRequestAuthorityStub>;
  ownerBudgetAuthority: DurableNamespaceLike<OwnerBudgetAuthorityStub>;
  ownerKey: string;
  adminKey?: string;
  callProvider(input: ProviderTransportInput): Promise<ProviderTransportResult>;
  now(): number;
  deadlineSignal(delayMs: number): AbortSignal;
}>;

/**
 * The key this policy spends against.
 *
 * A MISSING ADMIN KEY FALLS BACK TO THE OWNER KEY, and the caller that chose
 * the policy must fall back with it - see `resolvePolicy`. An admin LEDGER paired
 * with the owner KEY is the one combination that breaks the invariant the whole
 * design rests on: the ledger would permit a second $1 against a key that has
 * already spent its own, and OpenRouter's 402 becomes the thing that says no
 * instead of this app.
 */
function keyFor(
  resolved: ProviderOperationDependencies,
  policyVersion: SpendPolicyVersion,
): string {
  if (SPEND_POLICIES[policyVersion].keyBinding === 'OPENROUTER_ADMIN_KEY') {
    return resolved.adminKey ?? resolved.ownerKey;
  }
  return resolved.ownerKey;
}

function dependencies(overrides?: Partial<ProviderOperationDependencies>): ProviderOperationDependencies {
  const context = overrides?.requestAuthority && overrides.ownerBudgetAuthority && overrides.ownerKey
    ? null
    : getProviderOperationContext();
  return {
    requestAuthority: overrides?.requestAuthority ?? context!.requestAuthority,
    ownerBudgetAuthority: overrides?.ownerBudgetAuthority ?? context!.ownerBudgetAuthority,
    ownerKey: overrides?.ownerKey ?? context!.ownerKey,
    ...(overrides?.adminKey ?? context?.adminKey
      ? { adminKey: overrides?.adminKey ?? context!.adminKey }
      : {}),
    callProvider: overrides?.callProvider ?? ((input) => callOpenRouter(input)),
    now: overrides?.now ?? Date.now,
    deadlineSignal: overrides?.deadlineSignal ?? ((delayMs) => AbortSignal.timeout(delayMs)),
  };
}

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function isTerminal(
  result: ProviderRequestObservedResult,
): result is Exclude<ProviderRequestObservedResult, ProviderRequestPendingResult> {
  return result.status === 'completed'
    || result.status === 'failed'
    || result.status === 'unknown'
    || result.status === 'expired';
}

function completionResult(result: ProviderRequestCompletionResult): ProviderOperationResult {
  if (result.status === 'stored' || result.status === 'late') return result.outcome;
  return { status: 'unavailable' };
}

function pendingResult(result: ProviderRequestPendingResult): ProviderRequestPendingResult {
  return result;
}

export async function runProviderOperation(
  input: ProviderOperationInput,
  dependencyOverrides?: Partial<ProviderOperationDependencies>,
): Promise<ProviderOperationResult> {
  if (input.signal.aborted) return { status: 'unavailable' };

  let resolved: ProviderOperationDependencies;
  let requestAuthorityName: string;
  try {
    resolved = dependencies(dependencyOverrides);
    requestAuthorityName = await providerRequestName(input.requestId);
  } catch {
    return { status: 'unavailable' };
  }

  const policy = ownerPolicyForVariant(input.variant);
  const proposedAuthorityDay = utcDay(resolved.now());
  const requestAuthority = resolved.requestAuthority.get(
    resolved.requestAuthority.idFromName(requestAuthorityName),
  );

  // One decision, used for the request row, the ledger and the key. Splitting
  // it is how a request reserves from one budget and spends another's key.
  const policyVersion: SpendPolicyVersion = input.policyVersion ?? OWNER_POLICY_VERSION;

  let observed;
  try {
    observed = await requestAuthority.begin({
      requestDigest: requestAuthorityName,
      route: policy.route,
      variant: input.variant,
      bindingCandidates: input.bindingCandidates,
      proposedAuthorityDay,
      policyVersion,
      reservationNanodollars: policy.reservationNanodollars,
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (observed.status === 'conflict') return { status: 'conflict' };
  if (isTerminal(observed)) return observed;
  if (observed.phase === 'provider_inflight') return pendingResult(observed);
  if (input.signal.aborted) return { status: 'unavailable' };

  const budgetAuthority = resolved.ownerBudgetAuthority.get(
    resolved.ownerBudgetAuthority.idFromName(ledgerName(observed.authorityDay, policyVersion)),
  );
  const budgetBinding: OwnerBudgetBinding = {
    executionId: observed.executionId,
    requestAuthorityName,
    authorityDay: observed.authorityDay,
    route: policy.route,
    variant: input.variant,
    policyVersion,
    reservationNanodollars: policy.reservationNanodollars,
  };

  if (observed.phase === 'prepared' || observed.phase === 'reserved') {
    let reservation;
    try {
      reservation = await budgetAuthority.reserve(budgetBinding);
    } catch {
      return { status: 'unavailable' };
    }
    if (input.signal.aborted) return { status: 'unavailable' };
    if (reservation.status === 'exhausted') {
      return { status: 'budget-exhausted', resetAt: reservation.resetAt };
    }
    if (reservation.status !== 'reserved') return { status: 'unavailable' };

    try {
      const recorded = await requestAuthority.recordReservation({
        executionId: observed.executionId,
        authorityDay: observed.authorityDay,
        reservationNanodollars: policy.reservationNanodollars,
      });
      if (recorded.status !== 'recorded' || recorded.phase !== 'reserved') return { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
    if (input.signal.aborted) return { status: 'unavailable' };

    let committed;
    try {
      committed = await budgetAuthority.commit(budgetBinding);
    } catch {
      return { status: 'unavailable' };
    }
    if (committed.status !== 'committed') return { status: 'unavailable' };

    try {
      const recorded = await requestAuthority.recordBudgetCommitted({
        executionId: observed.executionId,
        transportDeadlineMs: committed.transportDeadlineMs,
        committedUntilMs: committed.committedUntilMs,
      });
      if (recorded.status !== 'recorded' || recorded.phase !== 'budget_committed') {
        return { status: 'unavailable' };
      }
    } catch {
      return { status: 'unavailable' };
    }
  }

  let claim;
  try {
    claim = await requestAuthority.claimTransport({ executionId: observed.executionId });
  } catch {
    return { status: 'unavailable' };
  }
  if (claim.status !== 'permit') {
    if (claim.status === 'conflict') return { status: 'unavailable' };
    return claim;
  }

  const afterClaimNow = resolved.now();
  if (afterClaimNow >= claim.transportDeadlineMs) {
    try {
      return completionResult(await requestAuthority.completeUnknown({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: 'provider_outcome_unknown',
      }));
    } catch {
      return { status: 'unavailable' };
    }
  }

  const deadline = resolved.deadlineSignal(Math.max(0, claim.transportDeadlineMs - afterClaimNow));
  const combinedSignal = AbortSignal.any([input.signal, deadline]);
  let invoked = false;
  let transport: ProviderTransportResult | null = null;
  const invoke: ProviderInvocation = async (providerBody) => {
    if (invoked) {
      transport = {
        status: 'failed',
        failure: { code: 'provider_invalid_response', httpStatus: 502 },
        costOutcome: { kind: 'malformed' },
      };
      return transport;
    }
    invoked = true;
    try {
      transport = await resolved.callProvider({
        consumerKind: CONSUMER_BY_VARIANT[input.variant],
        apiKey: keyFor(resolved, policyVersion),
        providerBody,
        signal: combinedSignal,
      });
    } catch {
      transport = {
        status: 'unknown',
        failure: { code: 'provider_outcome_unknown', httpStatus: 502 },
      };
    }
    return transport;
  };

  let replay: unknown;
  try {
    replay = await input.execute(invoke);
  } catch {
    // The closed transport outcome below, never the native exception, decides the durable result.
  }

  const finalTransport = transport as ProviderTransportResult | null;
  try {
    if (combinedSignal.aborted) {
      return completionResult(await requestAuthority.completeUnknown({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: 'provider_outcome_unknown',
      }));
    }
    if (!finalTransport || !invoked) {
      return completionResult(await requestAuthority.completeFailed({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: 'provider_invalid_response',
        httpStatus: 502,
        costOutcome: { kind: 'malformed' },
      }));
    }
    if (finalTransport.status === 'unknown') {
      return completionResult(await requestAuthority.completeUnknown({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: 'provider_outcome_unknown',
      }));
    }
    if (finalTransport.status === 'failed') {
      return completionResult(await requestAuthority.completeFailed({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: finalTransport.failure.code,
        httpStatus: finalTransport.failure.httpStatus,
        costOutcome: finalTransport.costOutcome,
      }));
    }
    if (replay === undefined) {
      return completionResult(await requestAuthority.completeFailed({
        executionId: observed.executionId,
        nonce: claim.nonce,
        code: 'provider_invalid_response',
        httpStatus: 502,
        costOutcome: finalTransport.costOutcome,
      }));
    }
    const completed = await requestAuthority.completeKnown({
      executionId: observed.executionId,
      nonce: claim.nonce,
      replay,
      costOutcome: finalTransport.costOutcome,
    });
    if (completed.status !== 'rejected') return completionResult(completed);
    return completionResult(await requestAuthority.completeFailed({
      executionId: observed.executionId,
      nonce: claim.nonce,
      code: 'provider_invalid_response',
      httpStatus: 502,
      costOutcome: finalTransport.costOutcome,
    }));
  } catch {
    return { status: 'unavailable' };
  }
}
