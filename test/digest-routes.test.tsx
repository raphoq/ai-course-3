import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const markerBeforeTests = process.env.LANE_MARKER;
let runsDir: string;
let fixtureRoot: string;
let config: RigConfig;

async function writeNight(contents: string, date = night) {
  await writeFile(join(runsDir, `${date}.jsonl`), contents, 'utf8');
}

async function getJson(path: string) {
  const response = await createApp(config).request(path);
  return { response, body: await response.json() as unknown };
}

function htmlJobOrder(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  if (tbody === undefined) return [];
  return [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const firstCell = row.match(/<td>([\s\S]*?)<\/td>/)?.[1];
    return firstCell ?? '';
  });
}

describe('digest routes', () => {
  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
    runsDir = join(fixtureRoot, 'runs');
    await mkdir(runsDir);
    config = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
  });

  afterEach(async () => {
    if (markerBeforeTests === undefined) delete process.env.LANE_MARKER;
    else process.env.LANE_MARKER = markerBeforeTests;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('serves one valid digest through HTML and JSON in the same sorted order', async () => {
    process.env.LANE_MARKER = 'route-test-lane';
    await writeNight([
      JSON.stringify({ at: '2026-10-28T23:10:00+02:00', job: 'zeta', status: 'ok', owner: 'Zed' }),
      JSON.stringify({ at: '2026-10-28T08:00:00-04:00', job: 'alpha', status: 'retry', owner: '<owner&>', error: 'upstream <503> & slow' }),
      '{malformed line',
      JSON.stringify({ at: '2026-10-28T08:01:00-04:00', job: 'alpha', status: 'retry', owner: '<owner&>', error: 'upstream <503> & slow' }),
      JSON.stringify({ at: '2026-10-28T08:02:00-04:00', job: 'alpha', status: 'retry', owner: '<owner&>', error: 'upstream <503> & slow' }),
      JSON.stringify({ at: '2026-10-28T08:03:00-04:00', job: 'alpha', status: 'ok', owner: '<owner&>' }),
      JSON.stringify({ at: '2026-10-28T14:00:00+02:00', job: 'recovered', status: 'fail', owner: 'Rae', error: 'disk <full>' }),
      JSON.stringify({ at: '2026-10-28T15:00:00+02:00', job: 'recovered', status: 'ok', owner: null }),
    ].join('\n'));

    const htmlResponse = await createApp(config).request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const { response: jsonResponse, body } = await getJson(`/api/digest/${night}`);
    const digest = body as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toMatch(/^application\/json\b/);
    expect(digest).toMatchObject({
      night,
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 1 },
    });
    expect(digest.rows).toHaveLength(3);
    expect(digest.rows.map(({ job }) => job)).toEqual(['alpha', 'recovered', 'zeta']);
    expect(htmlJobOrder(html)).toEqual(digest.rows.map(({ job }) => job));

    const alpha = digest.rows[0] as DigestRow;
    expect(alpha).toMatchObject({
      runs: 4,
      retries: 3,
      failures: 0,
      lastStatus: 'ok',
      lastError: 'upstream <503> & slow',
      firstAt: '2026-10-28T08:00:00-04:00',
      lastAt: '2026-10-28T08:03:00-04:00',
    });
    const recovered = digest.rows[1] as DigestRow;
    expect(recovered).toMatchObject({
      owner: null,
      runs: 2,
      failures: 1,
      lastStatus: 'ok',
      lastError: 'disk <full>',
    });
    expect(html).toContain('route-test-lane');
    expect(html).toContain('&lt;owner&amp;&gt;');
    expect(html).toContain('upstream &lt;503&gt; &amp; slow');
    expect(html).toContain('disk &lt;full&gt;');
    expect(html).not.toContain('upstream <503> & slow');
    expect(html).toContain('3 · high retries');
    expect(html).toContain('1 · failure recorded');
    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T08:00:00-04:00');
  });

  it('returns 404 and the stable JSON error for a missing night', async () => {
    const htmlResponse = await createApp(config).request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const { response, body } = await getJson(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(404);
    expect(html).toContain('night not found');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/);
    expect(body).toEqual({ error: 'night not found' });
  });

  it('returns an empty digest for an existing empty file', async () => {
    await writeNight('');
    const htmlResponse = await createApp(config).request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const { response, body } = await getJson(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(htmlJobOrder(html)).toEqual([]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/);
    expect(body).toMatchObject({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('continues after a malformed nonblank line on both routes', async () => {
    await writeNight([
      JSON.stringify({ at: '2026-10-28T11:00:00+03:00', job: 'before', status: 'ok', owner: 'A' }),
      'not json',
      JSON.stringify({ at: '2026-10-28T12:00:00+03:00', job: 'after', status: 'retry', owner: null }),
      '',
    ].join('\n'));

    const htmlResponse = await createApp(config).request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const { response, body } = await getJson(`/api/digest/${night}`);
    const digest = body as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map(({ job }) => job)).toEqual(['after', 'before']);
    expect(htmlJobOrder(html)).toEqual(digest.rows.map(({ job }) => job));
    expect(html).toContain('Malformed lines: 1');
  });

  it('rejects invalid date and path-like values without exposing adjacent files', async () => {
    const adjacentPath = join(fixtureRoot, `${night}.jsonl`);
    await writeFile(adjacentPath, JSON.stringify({ secret: 'adjacent-file-secret' }), 'utf8');
    try {
      for (const path of ['/api/digest/not-a-date', '/api/digest/2026-02-31', '/api/digest/%2e%2e%2f2026-10-28']) {
        const response = await createApp(config).request(path);
        const body = await response.text();
        expect(response.status).not.toBe(200);
        expect(body).not.toContain('adjacent-file-secret');
      }

      await expect(readFile(adjacentPath, 'utf8')).resolves.toContain('adjacent-file-secret');
    } finally {
      await rm(adjacentPath, { force: true });
    }
  });
});
