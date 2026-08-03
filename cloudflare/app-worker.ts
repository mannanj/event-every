// OpenNext generates this module after Next.js has finished its own typecheck.
// @ts-expect-error .open-next/worker.js is intentionally build-generated and may exist during checking.
import handler from '../.open-next/worker.js';

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return handler.fetch(request, env, ctx);
  },
};
