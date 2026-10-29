import { renderToString } from 'hono/jsx/dom/server';
import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';
import { Layout } from '../src/views/layout.js';

describe('digest view', () => {
  it('renders all columns, warning history, offsets, escaping, and the self-contained layout', () => {
    const digest: NightDigest = {
      night: '2026-10-28',
      badLines: 1,
      counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        {
          job: 'job <&>',
          owner: 'owner <&>',
          runs: 6,
          retries: 3,
          failures: 1,
          lastStatus: 'ok',
          lastError: 'error <&>',
          firstAt: '2026-10-28T01:02:03+03:00',
          lastAt: '2026-10-28T04:05:06-04:00',
        },
      ],
    };

    const html = renderToString(
      <Layout title="digest" lane={{ id: 'lane-test', marker: 'marker-test' }}>
        <DigestPage digest={digest} />
      </Layout>,
    );

    for (const heading of ['job', 'owner', 'runs', 'retries', 'failures', 'last status', 'last error', 'first time', 'last time']) {
      expect(html).toContain(`<th scope="col">${heading}</th>`);
    }
    expect(html).toContain('Malformed lines: 1');
    expect(html).toContain('3 · high retries');
    expect(html).toContain('1 · failure recorded');
    expect(html).toContain('ok');
    expect(html).toContain('2026-10-28T01:02:03+03:00');
    expect(html).toContain('2026-10-28T04:05:06-04:00');
    expect(html).toContain('owner &lt;&amp;&gt;');
    expect(html).toContain('error &lt;&amp;&gt;');
    expect(html).toContain('job &lt;&amp;&gt;');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<style>');
    expect(html).toContain('marker-test');
    expect(html).not.toContain('<script');
  });

  it('renders null owner and error as em dashes and the exact empty state', () => {
    const digest: NightDigest = {
      night: '2026-10-28',
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
      rows: [],
    };
    const empty = renderToString(<DigestPage digest={digest} />);
    expect(empty).toContain('nothing ran');
    expect(empty).not.toContain('<table>');

    digest.rows.push({
      job: 'empty fields',
      owner: null,
      runs: 1,
      retries: 0,
      failures: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T00:00:00Z',
      lastAt: '2026-10-28T00:00:00Z',
    });
    const withMissingValues = renderToString(<DigestPage digest={digest} />);
    expect(withMissingValues.match(/—/g)).toHaveLength(2);
  });
});
