import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CREDENTIAL_NAME = /OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST/i;
const preloadPath = path.resolve(import.meta.dir, 'e1-offline-preload.cjs');
type Environment = Record<string, string | undefined>;

function envNamesFromDotenv(dotenvPath: string): string[] {
  if (!existsSync(dotenvPath)) return [];
  return readFileSync(dotenvPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter((name): name is string => Boolean(name));
}

export function createE1OfflineEnvironment(environment: Environment = process.env): Environment {
  const credentialNames = new Set([
    ...Object.keys(environment),
    ...envNamesFromDotenv(path.resolve(process.cwd(), '.env.local')),
  ].filter((name) => CREDENTIAL_NAME.test(name)));
  const clean = { ...environment };
  for (const name of credentialNames) clean[name] = '';
  return {
    ...clean,
    E2E_TARGET: '',
    E2E_PROD_URL: '',
    E1_OFFLINE: '1',
    E1_OFFLINE_PRELOAD: preloadPath,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    NODE_OPTIONS: `--require=${preloadPath}`,
  };
}

function run(command: string[], environment: Environment): void {
  const result = Bun.spawnSync(command, { env: environment, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
}

const probe = `
if (!globalThis.__E1_OFFLINE_GUARD__) process.exit(2);
let blockedAttempt;
try { blockedAttempt = fetch('http://192.0.2.1'); }
catch (error) { process.exit(error && error.code === 'E1_OFFLINE_EGRESS_BLOCKED' ? 0 : 4); }
Promise.resolve(blockedAttempt).then(
  () => process.exit(3),
  (error) => process.exit(error && error.code === 'E1_OFFLINE_EGRESS_BLOCKED' ? 0 : 4),
);
`;

if (import.meta.main) {
  const environment = createE1OfflineEnvironment();
  run(['bun', `--preload=${preloadPath}`, '--eval', probe], environment);
  run(['node', '--require', preloadPath, '--eval', probe], environment);
  run(['bun', `--preload=${preloadPath}`, 'test', 'src', '--isolate'], environment);
  run(['node', '--require', preloadPath, 'node_modules/typescript/bin/tsc', '--noEmit'], environment);
  // The protected working-tree inventory may contain nested agent worktrees whose generated
  // outputs are intentionally preserved but are outside Event Every’s lint surface.
  run(['node', '--require', preloadPath, 'node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', '.claude/**'], environment);
  run(['node', '--require', preloadPath, 'node_modules/next/dist/bin/next', 'build'], environment);
  run(['node', '--require', preloadPath, 'node_modules/@playwright/test/cli.js', 'test'], environment);
}
