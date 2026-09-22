import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { RESERVED_ROUTE_MANIFEST, ROUTE_MANIFEST } from '@/platform/route-manifest';

type RouteSource = Readonly<{ route: string; path: string }>;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function routes(root: string): RouteSource[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? routes(path) : entry.name === 'route.ts'
      ? [{ route: path.replace(/^src\/app/, '').replace(/\/route\.ts$/, '').replace(/\\/g, '/'), path }]
      : [];
  });
}

function exportedHttpMethods(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods: string[] = [];
  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement)
      && (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && HTTP_METHODS.has(statement.name.text)) methods.push(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) methods.push(declaration.name.text);
      }
    }
  }
  return methods;
}

describe('route manifest', () => {
  test('every implemented API route is classified and every unimplemented entry is retired', () => {
    const actual = routes('src/app/api');
    for (const { route } of actual) expect(ROUTE_MANIFEST).toHaveProperty(route);
    for (const [route, policy] of Object.entries(ROUTE_MANIFEST)) {
      if (!actual.some((item) => item.route === route)) expect(policy.retired, route).toBe(true);
    }
  });

  test('every implemented route exports exactly its one policy method', () => {
    for (const { route, path } of routes('src/app/api')) {
      expect(exportedHttpMethods(path), path).toEqual([ROUTE_MANIFEST[route].method]);
    }
  });

  test('locks the private route methods, body ceilings, and retired waitlist', () => {
    expect(ROUTE_MANIFEST).toEqual({
      '/api/auth/check': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/auth/logout': { method: 'POST', maxBodyBytes: 0, allow: 'POST' },
      '/api/auth/verify': { method: 'POST', maxBodyBytes: 2 * 1024, allow: 'POST', retired: true },
      '/api/detect-urls': { method: 'POST', maxBodyBytes: 128 * 1024, allow: 'POST' },
      '/api/keep-alive': { method: 'GET', maxBodyBytes: 0, allow: 'GET', retired: true },
      '/api/provider-status': { method: 'POST', maxBodyBytes: 1024, allow: 'POST' },
      '/api/resolve-timezone': { method: 'POST', maxBodyBytes: 16 * 1024, allow: 'POST' },
      '/api/scan': { method: 'POST', maxBodyBytes: 12 * 1024 * 1024, allow: 'POST' },
      '/api/scrape-url': { method: 'POST', maxBodyBytes: 4 * 1024, allow: 'POST' },
      '/api/summarize': { method: 'POST', maxBodyBytes: 16 * 1024, allow: 'POST' },
      '/api/triage': { method: 'POST', maxBodyBytes: 20 * 1024, allow: 'POST' },
      '/api/usage': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/waitlist': { method: 'POST', maxBodyBytes: 4 * 1024, allow: 'POST', retired: true },
      '/api/auth/challenge': { method: 'POST', maxBodyBytes: 8 * 1024, allow: 'POST' },
      '/api/auth/config': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/auth/redeem': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/sync/pull': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/sync/push': { method: 'POST', maxBodyBytes: 4 * 1024 * 1024, allow: 'POST' },
      '/api/mcp/authorize': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/mcp/authorize/confirm': { method: 'POST', maxBodyBytes: 0, allow: 'POST' },
      '/api/mcp/events': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/mcp/events/save': { method: 'POST', maxBodyBytes: 64 * 1024, allow: 'POST' },
      '/api/mcp/events/remove': { method: 'POST', maxBodyBytes: 1024, allow: 'POST' },
      '/api/mcp/scan': { method: 'POST', maxBodyBytes: 16 * 1024 * 1024, allow: 'POST' },
      '/api/mcp/handoff': { method: 'POST', maxBodyBytes: 16 * 1024 * 1024, allow: 'POST' },
      '/api/attachments': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/attachments/settings': { method: 'POST', maxBodyBytes: 1024, allow: 'POST' },
      '/api/attachments/upload': { method: 'POST', maxBodyBytes: 84 * 1024 * 1024, allow: 'POST' },
      '/api/attachments/file': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/attachments/remove': { method: 'POST', maxBodyBytes: 32 * 1024, allow: 'POST' },
    });
  });

  test('reserves nothing now that challenge and redeem are real routes', () => {
    expect(RESERVED_ROUTE_MANIFEST).toEqual({});
  });
});
