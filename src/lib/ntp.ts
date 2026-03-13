/**
 * Lightweight NTP-like time sync using HTTP Date headers.
 * Estimates the offset between the local clock and a trusted server clock.
 * Usage: call syncTime() on app load, then use correctedNow() everywhere
 * instead of Date.now().
 */

let offsetMs = 0;
let synced = false;

const TIME_ENDPOINTS = [
  'https://worldtimeapi.org/api/timezone/Etc/UTC',
  'https://httpbin.org/get',
];

/**
 * Perform a single time probe against an HTTP endpoint.
 * Returns the estimated offset (serverTime - localTime) in ms,
 * or null if the probe failed.
 */
async function probe(url: string): Promise<number | null> {
  try {
    const t0 = Date.now();
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();

    const dateHeader = res.headers.get('Date');
    if (!dateHeader) return null;

    const serverTime = new Date(dateHeader).getTime();
    if (isNaN(serverTime)) return null;

    // Estimate: server timestamp corresponds to midpoint of request
    const rtt = t1 - t0;
    const localMid = t0 + rtt / 2;
    return serverTime - localMid;
  } catch {
    return null;
  }
}

/**
 * Sync local clock against a remote time source.
 * Takes the median of multiple probes for accuracy.
 * Safe to call multiple times; no-ops if already synced.
 */
export async function syncTime(): Promise<void> {
  if (synced) return;

  for (const url of TIME_ENDPOINTS) {
    const offsets: number[] = [];

    for (let i = 0; i < 3; i++) {
      const result = await probe(url);
      if (result !== null) offsets.push(result);
    }

    if (offsets.length >= 2) {
      offsets.sort((a, b) => a - b);
      offsetMs = offsets[Math.floor(offsets.length / 2)]!;
      synced = true;
      return;
    }
  }
  // If all endpoints failed, offset stays 0 (use local clock as-is)
}

/** Returns Date.now() corrected by the NTP offset. */
export function correctedNow(): number {
  return Date.now() + offsetMs;
}

/** Returns true if time sync has completed successfully. */
export function isSynced(): boolean {
  return synced;
}
