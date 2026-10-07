import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractZipEntry } from '../lib/zip';
import { parseStats } from '../lib/ci-history';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name));

test('reads a deflated results.json out of a multi-entry report artifact', () => {
  const entry = extractZipEntry(fixture('report.zip'), 'test-results/results.json');
  expect(entry).not.toBeNull();
  expect(parseStats(JSON.parse(entry!.toString('utf8')))).toEqual({ passed: 13, failed: 0, flaky: 0, skipped: 1 });
});

test('reads a stored qa-summary.json and maps Playwright stat names', () => {
  const entry = extractZipEntry(fixture('summary.zip'), 'qa-summary.json');
  expect(parseStats(JSON.parse(entry!.toString('utf8')))).toEqual({ passed: 12, failed: 1, flaky: 1, skipped: 0 });
});

test('missing entries, non-zips and incomplete stats yield null rather than invented totals', () => {
  expect(extractZipEntry(fixture('report.zip'), 'nope.json')).toBeNull();
  expect(extractZipEntry(Buffer.from('not a zip'), 'qa-summary.json')).toBeNull();
  expect(parseStats({ stats: { expected: 3, unexpected: 0 } })).toBeNull();
  expect(parseStats(null)).toBeNull();
});
