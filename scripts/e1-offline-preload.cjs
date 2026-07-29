/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

globalThis.__E1_OFFLINE_GUARD__ = true;

function blocked() {
  const error = new Error('E1 offline guard blocked non-loopback egress');
  error.code = 'E1_OFFLINE_EGRESS_BLOCKED';
  return error;
}

function isLoopback(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.');
  return octets.length === 4 && octets[0] === '127' && octets.every((part) => /^\d+$/.test(part) && Number(part) <= 255);
}

function hostnameFrom(value, options) {
  if (options && typeof options === 'object') return options.hostname || options.host || hostnameFrom(value);
  if (value && typeof value === 'object') {
    if (value.hostname || value.host) return value.hostname || value.host;
    if (value.href) return hostnameFrom(value.href);
  }
  if (typeof value === 'string') {
    try { return new URL(value).hostname; } catch { return value; }
  }
  return 'localhost';
}

function requireLoopback(value, options) {
  let hostname = hostnameFrom(value, options);
  if (
    typeof hostname === 'string'
    && !hostname.startsWith('[')
    && hostname.indexOf(':') === hostname.lastIndexOf(':')
    && hostname.includes(':')
  ) {
    hostname = hostname.split(':')[0];
  }
  if (!isLoopback(hostname)) throw blocked();
}

function requireLoopbackSocket(args) {
  const first = args[0];
  if (typeof first === 'string' && first.startsWith('/')) return;
  if (typeof first === 'number') {
    const hostnameArgument = args.slice(1).find((argument) => (
      typeof argument === 'string'
      || (
        argument
        && typeof argument === 'object'
        && (argument.hostname || argument.host)
      )
    ));
    requireLoopback(hostnameArgument ?? 'localhost');
    return;
  }
  requireLoopback(first);
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === 'function') {
  globalThis.fetch = function guardedFetch(input, init) {
    requireLoopback(input, init);
    return originalFetch.call(this, input, init);
  };
}

for (const transport of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function guardedRequest(...args) {
      requireLoopback(args[0], args[1]);
      return original.apply(this, args);
    };
  }
}

for (const method of ['connect', 'createConnection']) {
  const original = net[method];
  net[method] = function guardedConnect(...args) {
    requireLoopbackSocket(args);
    return original.apply(this, args);
  };
}

const originalTlsConnect = tls.connect;
tls.connect = function guardedTlsConnect(...args) {
  requireLoopbackSocket(args);
  return originalTlsConnect.apply(this, args);
};
