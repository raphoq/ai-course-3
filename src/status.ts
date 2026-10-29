import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import type { DigestCounts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type StatusNight = { night: string; counts: DigestCounts };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: StatusNight[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).flatMap((night) => {
      const digest = readNight(config.runsDir, night);
      return digest === null ? [] : [{ night, counts: digest.counts }];
    }),
  };
}
