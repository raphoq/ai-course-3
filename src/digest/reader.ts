import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event: Record<string, unknown> = value as Record<string, unknown>;
  return typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) &&
    typeof event.job === 'string' && event.job.trim().length > 0 &&
    (event.status === 'ok' || event.status === 'retry' || event.status === 'fail') &&
    (typeof event.owner === 'string' || event.owner === null) &&
    (event.error === undefined || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  let badLines = 0;
  const events: { event: RunEvent; timestamp: number; line: number }[] = [];
  for (const [line, textLine] of text.split(/\r?\n/).entries()) {
    if (textLine.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(textLine);
    } catch {
      badLines++;
      continue;
    }
    if (!isRunEvent(value)) {
      badLines++;
      continue;
    }
    events.push({ event: value, timestamp: Date.parse(value.at), line });
  }
  events.sort((a, b) => a.timestamp - b.timestamp || a.line - b.line);

  const counts = { ok: 0, retry: 0, fail: 0 };
  const rows = new Map<string, DigestRow>();
  for (const { event } of events) {
    counts[event.status]++;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }
  return {
    night, badLines, counts,
    rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
  };
};
