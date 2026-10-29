import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

let dir: string;
const night = '2026-10-28';
const event = { at: '2026-10-29T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
function write(lines: unknown[]) {
  writeFileSync(join(dir, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n'));
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('readNight', () => {
  it('reads the unmodified real night, including retries and the malformed line', () => {
    const digest = readNight('runs', night);
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.reduce((total, row) => total + row.runs, 0)).toBe(15);
    expect(digest?.rows[0]?.owner).toBeNull();
    expect(digest?.rows[1]).toMatchObject({
      runs: 4, retries: 3, failures: 0, lastStatus: 'ok', lastError: 'upstream 503',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail' });
  });

  it('distinguishes absent and empty nights', () => {
    expect(readNight(dir, night)).toBeNull();
    write([]);
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(readNight(join(dir, 'missing-directory'), night)).toBeNull();
  });

  it('rejects path-like and malformed night identifiers', () => {
    for (const name of ['../2026-10-28', '2026-10-28.jsonl', '/etc/passwd', '2026-1-2', '', '2026-10-28/other']) {
      expect(readNight(dir, name)).toBeNull();
    }
  });

  it('counts invalid event shapes and malformed JSON without losing valid events', () => {
    const invalid = [null, [], {}, { ...event, at: 'not-a-date' }, { ...event, job: '' },
      { ...event, status: 'unknown' }, { ...event, owner: undefined }, { ...event, error: 123 }];
    write([event, ...invalid, { ...event, job: 'b', owner: null }]);
    writeFileSync(join(dir, `${night}.jsonl`), '\n   \r\n{"incomplete":\n', { flag: 'a' });
    const digest = readNight(dir, night);
    expect(digest?.badLines).toBe(invalid.length + 1);
    expect(digest?.rows.map(row => row.job)).toEqual(['a', 'b']);
    expect(digest?.rows[1]?.owner).toBeNull();
    expect(digest?.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });

  it('uses actual time ordering, preserves offsets and retains recovered errors/failures', () => {
    write([
      { ...event, at: '2026-10-29T02:00:00+01:00', owner: null },
      { ...event, at: '2026-10-29T00:30:00Z', status: 'fail', error: 'quota' },
      { ...event, at: '2026-10-29T01:00:00+02:00', status: 'retry', error: 'busy' },
    ]);
    expect(readNight(dir, night)?.rows[0]).toEqual({
      job: 'a', owner: null, runs: 3, retries: 1, failures: 1, lastStatus: 'ok', lastError: 'quota',
      firstAt: '2026-10-29T01:00:00+02:00', lastAt: '2026-10-29T02:00:00+01:00',
    });
  });

  it('keeps file ordering when two timestamps represent the same instant', () => {
    write([{ ...event, status: 'retry', error: 'retry' },
      { ...event, at: '2026-10-29T00:00:00Z', owner: null }]);
    expect(readNight(dir, night)?.rows[0]).toMatchObject({
      firstAt: event.at, lastAt: '2026-10-29T00:00:00Z', lastStatus: 'ok', owner: null,
    });
  });

  it('does not hide unexpected filesystem errors', () => {
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
