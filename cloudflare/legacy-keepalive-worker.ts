type LegacyKeepAliveEnv = Readonly<{
  KEEPALIVE_DEPLOYMENT_DISABLED: '1';
  STATE_AUTHORITY_MODE: 'legacy' | 'shadow' | 'cloudflare';
  KV_REST_API_URL: string;
  KV_REST_API_TOKEN: string;
}>;
type ScheduledController = Readonly<{ scheduledTime: number }>;
type ExecutionContext = Readonly<{ waitUntil(work: Promise<unknown>): void }>;
type ExportedHandler<Env> = Readonly<{
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void;
}>;

function mapKeepAliveFailure(_error: unknown): undefined {
  // Compatibility failures are deliberately content-free and cannot affect an app response.
  return undefined;
}

async function runLegacyKeepAlive(env: LegacyKeepAliveEnv, scheduledTime: number): Promise<void> {
  if (env.STATE_AUTHORITY_MODE === 'cloudflare') return;
  try {
    const response = await fetch(
      `${env.KV_REST_API_URL}/set/keep-alive/${scheduledTime}?EX=172800`,
      { method: 'POST', headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}` } },
    );
    if (!response.ok) return mapKeepAliveFailure(undefined);
  } catch (error) {
    return mapKeepAliveFailure(error);
  }
}

export default {
  scheduled(controller: ScheduledController, env: LegacyKeepAliveEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runLegacyKeepAlive(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<LegacyKeepAliveEnv>;
