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
    if (ts.isFunctionDeclaration(statement) && statement.name && HTTP_METHODS.has(statement.name.text)) {
      methods.push(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) methods.push(declaration.name.text);
      }
    }
  }
  return methods;
}

describe('route manifest', () => {
  test('every API route has one manifest entry', () => {
    expect(Object.keys(ROUTE_MANIFEST).sort()).toEqual(routes('src/app/api').map(({ route }) => route).sort());
  });

  test('every route exports exactly its one policy method', () => {
    for (const { route, path } of routes('src/app/api')) {
      expect(exportedHttpMethods(path), path).toEqual([ROUTE_MANIFEST[route].method]);
    }
  });

  test('locks every Task 3 method, body ceiling, Allow value, and retirement', () => {
    expect(ROUTE_MANIFEST).toEqual({
      '/api/auth/check': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/auth/logout': { method: 'POST', maxBodyBytes: 0, allow: 'POST' },
      '/api/auth/verify': { method: 'POST', maxBodyBytes: 2 * 1024, allow: 'POST', retired: true },
      '/api/detect-urls': { method: 'POST', maxBodyBytes: 128 * 1024, allow: 'POST' },
      '/api/keep-alive': { method: 'GET', maxBodyBytes: 0, allow: 'GET', retired: true },
      '/api/resolve-timezone': { method: 'POST', maxBodyBytes: 16 * 1024, allow: 'POST' },
      '/api/scan': { method: 'POST', maxBodyBytes: 12 * 1024 * 1024, allow: 'POST' },
      '/api/scrape-url': { method: 'POST', maxBodyBytes: 4 * 1024, allow: 'POST' },
      '/api/summarize': { method: 'POST', maxBodyBytes: 16 * 1024, allow: 'POST' },
      '/api/usage': { method: 'GET', maxBodyBytes: 0, allow: 'GET' },
      '/api/waitlist': { method: 'POST', maxBodyBytes: 4 * 1024, allow: 'POST' },
    });
  });

  test('reserves auth challenge and redeem outside the actual-route manifest', () => {
    expect(RESERVED_ROUTE_MANIFEST).toEqual({
      '/api/auth/challenge': { method: 'POST', maxBodyBytes: 2 * 1024, allow: 'POST' },
      '/api/auth/redeem': { method: 'POST', maxBodyBytes: 2 * 1024, allow: 'POST' },
    });
    expect(Object.keys(ROUTE_MANIFEST)).not.toContain('/api/auth/challenge');
    expect(Object.keys(ROUTE_MANIFEST)).not.toContain('/api/auth/redeem');
  });
});
