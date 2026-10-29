import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-board-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest links on the status board', () => {
  it('shows newest-first nights and labeled event counts including zeroes', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job: 'build', status: 'ok', owner: 'ada' }),
      '{malformed',
      JSON.stringify({ at: '2026-10-28T08:01:00+01:00', job: 'build', status: 'retry', owner: 'ada' }),
    ].join('\n'));
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    writeFileSync(join(runsDir, 'notes.jsonl'), JSON.stringify({ at: '2026-10-27T08:00:00Z', job: 'ignored', status: 'fail', owner: null }));

    const res = await createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir }).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok: 1');
    expect(html).toContain('retry: 1');
    expect(html).toContain('fail: 0');
    expect(html).not.toContain('notes');
  });

  it('keeps the existing empty state when there are no night files', async () => {
    const runsDir = makeRunsDir();
    mkdirSync(runsDir, { recursive: true });
    const res = await createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir }).request('/');
    expect(await res.text()).toContain('nothing in runs/');
  });
});
