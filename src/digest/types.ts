export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestCounts = { ok: number; retry: number; fail: number };

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  failures: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: DigestCounts;
};

export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
