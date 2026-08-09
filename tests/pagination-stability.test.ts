import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('offset pagination ordering', () => {
  it('uses a unique id tie-breaker for every sync endpoint', () => {
    const root = resolve(process.cwd(), 'api');
    const sources = [
      readFileSync(resolve(root, 'invoices.ts'), 'utf8'),
      readFileSync(resolve(root, 'billboards.ts'), 'utf8'),
      readFileSync(resolve(root, 'contracts.ts'), 'utf8'),
      readFileSync(resolve(root, 'clients.ts'), 'utf8'),
    ];

    for (const source of sources) {
      expect(source).toMatch(/orderBy:\s*\[\s*\{\s*(?:createdAt|dbCreatedAt):\s*'asc'\s*\},\s*\{\s*id:\s*'asc'\s*\}\s*\]/);
    }
  });
});
