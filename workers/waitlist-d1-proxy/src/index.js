// D1 proxy for the Spirit & Hammer waitlist. The Worker's binding is scoped to
// this one database — tighter than an account-wide D1 API token — and the
// response mirrors the Cloudflare REST shape so src/lib/d1.ts parses both.
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    if (!env.PROXY_SECRET) {
      return new Response('proxy not configured', { status: 503 });
    }
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${env.PROXY_SECRET}`) {
      return new Response('unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ success: false, errors: [{ message: 'invalid JSON' }] }, { status: 400 });
    }

    const sql = typeof body.sql === 'string' ? body.sql : '';
    const params = Array.isArray(body.params) ? body.params : [];
    if (!sql) {
      return Response.json({ success: false, errors: [{ message: 'sql required' }] }, { status: 400 });
    }

    try {
      const result = await env.DB.prepare(sql).bind(...params).all();
      return Response.json({
        success: true,
        result: [{ results: result.results ?? [], meta: result.meta ?? {} }],
      });
    } catch (error) {
      return Response.json(
        { success: false, errors: [{ message: error instanceof Error ? error.message : 'query failed' }] },
        { status: 400 }
      );
    }
  },
};
