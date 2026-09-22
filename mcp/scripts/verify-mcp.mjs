#!/usr/bin/env node
/**
 * Portable validation gate for a remote MCP server on Cloudflare.
 *
 * Checks the things that break connectors while every ordinary health check
 * still looks fine. See README.md in this directory for the failure catalogue
 * each assertion corresponds to.
 *
 *   node verify-mcp.mjs https://my-mcp.example.workers.dev
 *   MCP_ACCESS_TOKEN=… node verify-mcp.mjs https://…
 *   MCP_EXPECT_TOOLS=a,b node verify-mcp.mjs https://…
 *
 * Env:
 *   MCP_ACCESS_TOKEN   bearer token; enables the authenticated half
 *   MCP_EXPECT_TOOLS   comma-separated tool names that must appear
 *   MCP_TEST_ORIGIN    browser origin to simulate (default https://claude.ai)
 *   MCP_REQUIRE_AUTH   "0" if the server is intentionally public
 *   MCP_PATH           route the server listens on (default /mcp). A server
 *                      may expose more than one — an open route beside an
 *                      OAuth-gated one, say — and each needs its own run.
 *
 * Exits non-zero on failure, so it can gate a deploy.
 */
const BASE = (process.argv[2] || process.env.MCP_BASE_URL || "").replace(/\/$/, "");
if (!BASE) { console.error("usage: node verify-mcp.mjs <baseUrl>"); process.exit(2); }

const PATH = (process.env.MCP_PATH || "/mcp").replace(/\/$/, "");
const MCP = `${BASE}${PATH.startsWith("/") ? PATH : `/${PATH}`}`;
const TOKEN = process.env.MCP_ACCESS_TOKEN || "";
const ORIGIN = process.env.MCP_TEST_ORIGIN || "https://claude.ai";
const EXPECT = (process.env.MCP_EXPECT_TOOLS || "").split(",").map((t) => t.trim()).filter(Boolean);
const REQUIRE_AUTH = process.env.MCP_REQUIRE_AUTH !== "0";
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

let failures = 0, partial = false;
const ok = (l, d = "") => console.log(`  ok    ${l.padEnd(38)} ${d}`);
const fail = (l, d) => { failures++; console.log(`  FAIL  ${l.padEnd(38)} ${d}`); };
const check = (l, exp, act) => (String(exp) === String(act) ? ok(l, String(act)) : fail(l, `expected ${exp}, got ${act}`));
const auth = () => (TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {});

async function post(body, { origin, token = true, headers = {} } = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(origin ? { Origin: origin } : {}),
      ...(token ? auth() : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // Streamable HTTP may answer as SSE; unwrap the first data: frame.
  let json = null;
  try {
    json = text.startsWith("event:") || text.startsWith("data:")
      ? JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5).trim())
      : JSON.parse(text);
  } catch { json = { raw: text.slice(0, 160) }; }
  return { res, json, text };
}

const initBody = (v) => ({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v, capabilities: {}, clientInfo: { name: "verify", version: "1" } } });

console.log(`Verifying MCP server at ${MCP}\n`);

// 1. Auth posture ────────────────────────────────────────────────────────────
console.log("1. auth posture");
{
  const { res } = await post(initBody(VERSIONS[0]), { origin: ORIGIN, token: false });
  if (REQUIRE_AUTH) {
    check("unauthenticated initialize", 401, res.status);
    const wa = res.headers.get("www-authenticate") || "";
    wa.includes("resource_metadata=") ? ok("WWW-Authenticate advertises metadata")
      : fail("WWW-Authenticate advertises metadata", wa || "header absent");
    // Without this a browser client cannot READ the challenge it must follow.
    const exp = (res.headers.get("access-control-expose-headers") || "").toLowerCase();
    exp.includes("www-authenticate") ? ok("challenge readable cross-origin")
      : fail("challenge readable cross-origin", exp || "none");
  } else {
    check("public initialize", 200, res.status);
  }
}

// 2. Discovery (auth servers only) ───────────────────────────────────────────
if (REQUIRE_AUTH) {
  console.log("\n2. OAuth discovery");
  for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]) {
    // 405 here means a request guard is shadowing the provider's routes.
    check(p.replace("/.well-known/", ""), 200, (await fetch(BASE + p)).status);
  }
  const meta = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json().catch(() => ({}));
  for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) {
    meta[k] ? ok(`metadata.${k}`, String(meta[k]).replace(BASE, "")) : fail(`metadata.${k}`, "missing");
  }
}

// 3. CORS ────────────────────────────────────────────────────────────────────
console.log("\n3. CORS for browser clients");
{
  const pre = await fetch(MCP, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } });
  check("OPTIONS preflight", 204, pre.status);
  check("preflight allow-origin", ORIGIN, pre.headers.get("access-control-allow-origin"));
}

// 4/5. Protocol + tools ──────────────────────────────────────────────────────
if (REQUIRE_AUTH && !TOKEN) {
  console.log("\n  skip  authenticated half                 MCP_ACCESS_TOKEN not set");
  partial = true;
} else {
  console.log("\n4. protocol negotiation (with browser Origin)");
  for (const v of VERSIONS) {
    // A server that answers a version other than the one requested fails to
    // attach as a connector, yet passes an SDK-based harness.
    const { json } = await post(initBody(v), { origin: ORIGIN, headers: { "mcp-protocol-version": v } });
    check(`echoes ${v}`, v, json?.result?.protocolVersion ?? JSON.stringify(json).slice(0, 70));
  }

  console.log("\n5. tools");
  const { json: list } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { origin: ORIGIN });
  const names = (list?.result?.tools || []).map((t) => t.name);
  names.length ? ok("tools/list", names.join(", ")) : fail("tools/list", JSON.stringify(list).slice(0, 180));
  for (const t of EXPECT) names.includes(t) ? ok(`exposes ${t}`) : fail(`exposes ${t}`, "absent");

  // The context tax, which nothing otherwise measures. Every description,
  // schema and annotation on this list is sent to the model on every single
  // conversation that has the connector attached, before anybody asks for
  // anything. It is the one cost of a tool surface that grows silently: adding
  // a tool feels free, and it is not.
  //
  // MCP_MAX_LIST_BYTES turns it from an observation into a gate. Ours is set
  // to 26000 against a measured 17300 across ten tools - about 4,300 tokens.
  // Roughly 50% headroom: adding a tool passes, doubling the surface does not.
  {
    const bytes = Buffer.byteLength(JSON.stringify(list?.result?.tools ?? []), "utf8");
    const ceiling = Number(process.env.MCP_MAX_LIST_BYTES || 0);
    const per = names.length ? Math.round(bytes / names.length) : 0;
    const detail = `${bytes} bytes, ${names.length} tools, ~${per} each`;
    if (ceiling > 0 && bytes > ceiling) fail("tools/list size", `${detail} — over ${ceiling}`);
    else ok("tools/list size", detail);
  }

  console.log("\n6. transport conformance");
  {
    // A notification has no id: 202 + EMPTY body, or the handshake dies silently.
    const res = await fetch(MCP, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Origin: ORIGIN, ...auth() },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    check("notifications/initialized", 202, res.status);
    const body = (await res.text()).trim();
    body === "" ? ok("notification body empty") : fail("notification body empty", body.slice(0, 90));

    const get = await fetch(MCP, { headers: { Accept: "text/event-stream", ...auth() } });
    [405, 400].includes(get.status) ? ok("GET rejected", String(get.status)) : fail("GET rejected", `got ${get.status}`);

    const del = await fetch(MCP, { method: "DELETE", headers: auth() });
    [405, 400, 404].includes(del.status) ? ok("DELETE rejected", String(del.status)) : fail("DELETE rejected", `got ${del.status}`);

    const unknown = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { origin: "https://unlisted.example" });
    check("unknown origin rejected", 403, unknown.res.status);
  }

  if (REQUIRE_AUTH) {
    console.log("\n7. token enforcement");
    const { res } = await post({ jsonrpc: "2.0", id: 3, method: "tools/list" }, { origin: ORIGIN, token: false });
    check("tools/list without token", 401, res.status);
  }
}

console.log(
  failures > 0 ? `\n${failures} CHECK(S) FAILED`
    : partial ? "\nPUBLIC SURFACE PASSED (set MCP_ACCESS_TOKEN for a full run)"
      : "\nALL CHECKS PASSED",
);
process.exit(failures > 0 ? 1 : 0);
