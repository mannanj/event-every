/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const CREDENTIAL_NAME = /(OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST|D1|R2|AUTH_PATTERN)/i;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DNS_METHODS = [
  'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname',
  'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse',
];
const DOTENV_NAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.production.local',
  '.env.development', '.env.development.local', '.env.test', '.env.test.local',
]);
const REPOSITORY_ROOT = path.resolve(__dirname, '..');

function filesystemPath(value) {
  try {
    if (value instanceof URL) {
      if (value.protocol !== 'file:') return '';
      return path.resolve(fileURLToPath(value));
    }
    if (Buffer.isBuffer(value)) return path.resolve(value.toString());
    return typeof value === 'string' ? path.resolve(value) : '';
  } catch { return ''; }
}

function projectDotenv(value) {
  const resolved = filesystemPath(value);
  return resolved !== '' && path.dirname(resolved) === REPOSITORY_ROOT && DOTENV_NAMES.has(path.basename(resolved));
}

function missingDotenv(value, syscall = 'open') {
  const error = new Error(`ENOENT: no such file or directory, ${syscall} '${filesystemPath(value)}'`);
  error.code = 'ENOENT'; error.errno = -2; error.path = filesystemPath(value); error.syscall = syscall;
  return error;
}

const originalExistsSync = fs.existsSync;
fs.existsSync = function c1aOfflineExistsSync(value) {
  if (projectDotenv(value)) return false;
  return originalExistsSync.apply(this, arguments);
};

for (const method of ['accessSync', 'lstatSync', 'openSync', 'readFileSync', 'statSync']) {
  const original = fs[method];
  fs[method] = function c1aOfflineDotenvSync(value) {
    if (projectDotenv(value)) throw missingDotenv(value, method.replace(/Sync$/, ''));
    return original.apply(this, arguments);
  };
}

for (const method of ['access', 'lstat', 'open', 'readFile', 'stat']) {
  const original = fs[method];
  fs[method] = function c1aOfflineDotenvCallback(value, ...args) {
    if (!projectDotenv(value)) return original.call(this, value, ...args);
    const callback = [...args].reverse().find((argument) => typeof argument === 'function');
    if (callback) { queueMicrotask(() => callback(missingDotenv(value, method))); return; }
    throw missingDotenv(value, method);
  };
}

const originalExists = fs.exists;
fs.exists = function c1aOfflineExists(value, callback) {
  if (projectDotenv(value)) { queueMicrotask(() => callback(false)); return; }
  return originalExists.call(this, value, callback);
};

const originalCreateReadStream = fs.createReadStream;
fs.createReadStream = function c1aOfflineCreateReadStream(value) {
  if (projectDotenv(value)) throw missingDotenv(value, 'open');
  return originalCreateReadStream.apply(this, arguments);
};

for (const promises of [fs.promises, fsPromises]) {
  for (const method of ['access', 'lstat', 'open', 'readFile', 'stat']) {
    const original = promises[method];
    promises[method] = async function c1aOfflineDotenvPromise(value, ...args) {
      if (projectDotenv(value)) throw missingDotenv(value, method);
      return original.call(this, value, ...args);
    };
  }
}
const ROUTING_HOOKS = ['dispatcher', 'proxy', 'agent', 'socketPath', 'createConnection', 'lookup', 'connection', 'fd', 'handle'];

function blocked() {
  const error = new Error('C1_A_EGRESS_BLOCKED');
  error.code = 'C1_A_EGRESS_BLOCKED';
  return error;
}

function propertyValue(value, key) {
  let current = value;
  while (current && typeof current === 'object') {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw blocked();
      return { present: true, value: descriptor.value };
    }
    current = Object.getPrototypeOf(current);
  }
  return { present: false, value: undefined };
}

function snapshotOptions(value) {
  const snapshot = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw blocked();
    if (descriptor.enumerable) Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
}

function rejectRoutingHooks(value, extra = [], allowed = []) {
  if (!value || typeof value !== 'object') return;
  for (const key of [...ROUTING_HOOKS, ...extra]) {
    const property = propertyValue(value, key);
    if (!allowed.includes(key) && property.present && property.value !== undefined && property.value !== null) throw blocked();
  }
}

function exactHost(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  const normalized = value.toLowerCase();
  if (LOOPBACK.has(normalized)) return normalized;
  const authority = normalized.match(/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/);
  return authority ? authority[1] : '';
}

function urlHost(value) {
  try {
    const raw = typeof value === 'string' ? value : value instanceof URL ? value.href : value && (value.url || value.href);
    if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) return '';
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return '';
    return exactHost(parsed.hostname);
  } catch {
    return '';
  }
}

function isWebSocketUpgrade(headers) {
  if (!headers || typeof headers !== 'object') return false;
  const normalized = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value).toLowerCase()]));
  return normalized.get('upgrade') === 'websocket' && normalized.get('connection')?.split(/\s*,\s*/).includes('upgrade');
}

function guardedWebSocketSocketOptions(options, tlsMode) {
  const host = exactHost(options && (options.hostname || options.host));
  const port = Number(options && options.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw blocked();
  return tlsMode
    ? { host, port, servername: '', rejectUnauthorized: options.rejectUnauthorized !== false }
    : { host, port };
}

function rejectProxyRequest(options, tlsMode = false) {
  if (!options || typeof options !== 'object') return options;
  const connectionHook = propertyValue(options, 'createConnection');
  const hasConnectionHook = connectionHook.present && connectionHook.value !== undefined && connectionHook.value !== null;
  rejectRoutingHooks(options, [], hasConnectionHook ? ['createConnection'] : []);
  const sanitized = snapshotOptions(options);
  if (hasConnectionHook) {
    if (typeof connectionHook.value !== 'function' || !isWebSocketUpgrade(sanitized.headers)) throw blocked();
    sanitized.createConnection = tlsMode
      ? (socketOptions) => tls.connect(guardedWebSocketSocketOptions(socketOptions, true))
      : (socketOptions) => net.connect(guardedWebSocketSocketOptions(socketOptions, false));
  }
  if (typeof sanitized.path === 'string' && /^https?:\/\//i.test(sanitized.path)) throw blocked();
  if (String(sanitized.method || '').toUpperCase() === 'CONNECT') throw blocked();
  const headers = sanitized.headers;
  if (headers && typeof headers === 'object') {
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (['proxy-authorization', 'forwarded', 'x-forwarded-host'].includes(lower)) throw blocked();
      if (lower === 'host' && !exactHost(String(value))) throw blocked();
    }
  }
  return sanitized;
}

function requireHttpTarget(value, options, tlsMode = false) {
  if (value !== options) rejectProxyRequest(value);
  const sanitizedOptions = rejectProxyRequest(options, tlsMode);
  let host = '';
  if (sanitizedOptions && typeof sanitizedOptions === 'object' && (sanitizedOptions.hostname !== undefined || sanitizedOptions.host !== undefined)) {
    host = exactHost(sanitizedOptions.hostname || sanitizedOptions.host);
  } else if (value && typeof value === 'object' && !(value instanceof URL) && (value.hostname !== undefined || value.host !== undefined)) {
    host = exactHost(value.hostname || value.host);
  } else {
    host = urlHost(value) || exactHost(value);
  }
  if (!host) throw blocked();
  return sanitizedOptions;
}

function requireDns(value) {
  if (!LOOPBACK.has(String(value).toLowerCase())) throw blocked();
}

function requireSocket(args, tlsMode = false) {
  const first = args[0];
  if (typeof first === 'number') {
    rejectRoutingHooks(args[2], tlsMode ? ['socket'] : []);
    if (!exactHost(args[1])) throw blocked();
    return;
  }
  if (typeof first === 'string') throw blocked();
  rejectRoutingHooks(first, tlsMode ? ['socket'] : []);
  rejectRoutingHooks(args[1], tlsMode ? ['socket'] : []);
  if (!first || !exactHost(first.hostname || first.host)) throw blocked();
}

for (const name of Object.keys(process.env)) if (CREDENTIAL_NAME.test(name)) process.env[name] = '';
for (const name of ['BUN_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) delete process.env[name];
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
globalThis.__C1_A_OFFLINE_GUARD__ = true;

if (typeof globalThis.fetch === 'function') {
  const original = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    rejectRoutingHooks(init);
    requireHttpTarget(input);
    return original.call(this, input, init);
  };
}

for (const transport of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function guardedRequest(...args) {
      const optionIndex = args.findIndex((arg, index) => index < 2 && arg && typeof arg === 'object' && !(arg instanceof URL));
      const options = optionIndex >= 0 ? args[optionIndex] : undefined;
      const sanitized = requireHttpTarget(args[0], options, transport === https);
      const guardedArgs = [...args];
      if (optionIndex >= 0) guardedArgs[optionIndex] = sanitized;
      return original.apply(this, guardedArgs);
    };
  }
}

for (const method of ['connect', 'createConnection']) {
  const original = net[method];
  net[method] = function guardedConnection(...args) {
    requireSocket(args);
    return original.apply(this, args);
  };
}
const originalTls = tls.connect;
tls.connect = function guardedTls(...args) {
  requireSocket(args, true);
  return originalTls.apply(this, args);
};

for (const method of DNS_METHODS) {
  const original = dns[method];
  if (typeof original === 'function') dns[method] = function guardedDns(...args) { requireDns(args[0]); return original.apply(this, args); };
}
if (dns.promises) {
  for (const method of DNS_METHODS) {
    const original = dns.promises[method];
    if (typeof original === 'function') dns.promises[method] = function guardedDnsPromise(...args) { requireDns(args[0]); return original.apply(this, args); };
  }
}
if (dns.Resolver) {
  const OriginalResolver = dns.Resolver;
  dns.Resolver = function GuardedResolver(...constructorArgs) {
    const resolver = new OriginalResolver(...constructorArgs);
    for (const method of DNS_METHODS.filter((name) => name.startsWith('resolve') || name === 'reverse')) {
      const original = resolver[method];
      if (typeof original === 'function') resolver[method] = function guardedResolver(...args) { requireDns(args[0]); return original.apply(this, args); };
    }
    return resolver;
  };
  dns.Resolver.prototype = OriginalResolver.prototype;
}

if (globalThis.Bun && typeof globalThis.Bun.connect === 'function') {
  const original = globalThis.Bun.connect;
  globalThis.Bun.connect = function guardedBunConnect(...args) {
    const options = args[0];
    rejectRoutingHooks(options);
    if (!options || !exactHost(options.hostname || options.host)) throw blocked();
    return original.apply(this, args);
  };
}
if (globalThis.Bun && typeof globalThis.Bun.udpSocket === 'function') {
  const original = globalThis.Bun.udpSocket;
  const wrap = (socket) => {
    if (!socket || typeof socket.send !== 'function') return socket;
    const send = socket.send;
    socket.send = function guardedUdpSend(data, port, address) {
      requireDns(address);
      return send.call(this, data, port, address);
    };
    return socket;
  };
  globalThis.Bun.udpSocket = function guardedUdpSocket(options = {}) {
    rejectRoutingHooks(options);
    const connected = options.connect;
    if (connected && !exactHost(connected.hostname || connected.host || connected.address)) throw blocked();
    const result = original.call(this, options);
    return result && typeof result.then === 'function' ? result.then(wrap) : wrap(result);
  };
}

if (typeof globalThis.WebSocket === 'function') {
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class GuardedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      requireHttpTarget(String(url).replace(/^ws(s?):/i, 'http$1:'));
      super(url, protocols);
    }
  };
}
