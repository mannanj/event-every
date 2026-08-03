import type {
  LegacyProviderPort,
  LegacyUsagePort,
  LegacyWaitlistPort,
  NotReady,
  StateAuthorityMode,
} from '@/platform/contracts';
import { legacyProviderPort, legacyUsagePort, legacyWaitlistPort } from '@/platform/legacy';

type Ports = Readonly<{
  mode: StateAuthorityMode;
  provider: LegacyProviderPort;
  usage: LegacyUsagePort;
  waitlist: LegacyWaitlistPort;
}>;

let injected: Partial<Ports> | undefined;

export function setPlatformRuntimeForTests(value: Partial<Ports> | undefined): void {
  injected = value;
}

function stateAuthorityMode(): StateAuthorityMode {
  const value = injected?.mode ?? process.env.STATE_AUTHORITY_MODE ?? 'legacy';
  if (value === 'legacy' || value === 'shadow' || value === 'cloudflare') return value;
  throw new Error('unknown STATE_AUTHORITY_MODE');
}

const notReadyProviderPort: NotReady = { status: 'not-ready', code: 'c1_state_not_ready' };
const notReadyUsagePort: NotReady = { status: 'not-ready', code: 'c1_state_not_ready' };
const notReadyWaitlistPort: NotReady = { status: 'not-ready', code: 'c1_state_not_ready' };

export function getProviderPort(): LegacyProviderPort | NotReady {
  if (stateAuthorityMode() !== 'legacy') return notReadyProviderPort;
  return injected?.provider ?? legacyProviderPort;
}

export function getUsagePort(): LegacyUsagePort | NotReady {
  if (stateAuthorityMode() !== 'legacy') return notReadyUsagePort;
  return injected?.usage ?? legacyUsagePort;
}

export function getWaitlistPort(): LegacyWaitlistPort | NotReady {
  if (stateAuthorityMode() !== 'legacy') return notReadyWaitlistPort;
  return injected?.waitlist ?? legacyWaitlistPort;
}
