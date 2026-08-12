/* eslint-disable @typescript-eslint/no-require-imports */
// This file intentionally has no application imports: it is the first code in every
// private-offline child process.
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

const CREDENTIAL_NAME = /(?:OPENROUTER|ANTHROPIC|API[_-]?KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV[_-]?REST|D1|R2|AUTH[_-]?PATTERN|PASSWORD|CREDENTIAL|(?:^|_)PAT(?:_|$)|DATABASE|DSN|CONNECTION|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|GITHUB)/i;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function blocked() {
  const error = new Error('PRIVATE_OFFLINE_EGRESS_BLOCKED');
  error.code = 'PRIVATE_OFFLINE_EGRESS_BLOCKED';
  return error;
}

function loopback(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  if (LOOPBACK.has(normalized)) return true;
  const host = normalized.replace(/^\[|\]$/g, '').split(':')[0];
  return LOOPBACK.has(host);
}

function target(value) {
  try {
    if (typeof value === 'string' && !/^[a-z]+:/i.test(value)) return value;
    if (value && typeof value === 'object' && !(value instanceof URL) && ('hostname' in value || 'host' in value)) {
      return String(value.hostname || value.host || '');
    }
    const url = value instanceof URL ? value : new URL(typeof value === 'string' ? value : value.url);
    return url.hostname;
  } catch { return ''; }
}

function permitted(value) {
  return loopback(target(value));
}

function requireTarget(value, options, mode) {
  const candidate = options && typeof options === 'object' && (options.hostname || options.host)
    ? options
    : value;
  if (!permitted(candidate)) throw blocked();
}

for (const name of Object.keys(process.env)) if (CREDENTIAL_NAME.test(name) || !['PATH', 'TMPDIR', 'TMP', 'TEMP', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'CI'].includes(name)) delete process.env[name];
for (const name of ['BUN_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) delete process.env[name];
process.env.BUN_OPTIONS = `--preload=${__filename}`;
process.env.NODE_OPTIONS = `--require=${__filename}`;
process.env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
globalThis.__PRIVATE_OFFLINE_GUARD__ = true;

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function privateOfflineFetch(input, init) {
    requireTarget(input, init, 'fetch');
    return originalFetch.call(this, input, init);
  };
}

for (const transport of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function privateOfflineRequest(...args) {
      const options = args.find((arg) => arg && typeof arg === 'object' && !(arg instanceof URL));
      requireTarget(args[0], options, 'socket');
      return original.apply(this, args);
    };
  }
}
for (const method of ['connect', 'createConnection']) {
  const original = net[method];
  net[method] = function privateOfflineNet(...args) {
    const input = typeof args[0] === 'number' ? args[1] : args[0];
    requireTarget(input, undefined, 'socket');
    return original.apply(this, args);
  };
}
const originalTlsConnect = tls.connect;
tls.connect = function privateOfflineTls(...args) {
  const input = typeof args[0] === 'number' ? args[1] : args[0];
  requireTarget(input, undefined, 'socket');
  return originalTlsConnect.apply(this, args);
};
if (typeof globalThis.WebSocket === 'function') {
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class PrivateOfflineWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      requireTarget(String(url).replace(/^ws(s?):/i, 'http$1:'), undefined, 'socket');
      super(url, protocols);
    }
  };
}
