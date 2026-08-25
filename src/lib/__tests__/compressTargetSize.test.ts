import { describe, it, expect } from 'vitest';
import { offersKbUnit, smallestReachableTarget } from '@/lib/compressTargetSize';

const KB = 1024;
const MB = 1024 * 1024;

describe('compressTargetSize — which units are worth offering', () => {
  it('[CTS-01] offers KB when the floor is below a megabyte', () => {
    expect(offersKbUnit(200 * KB)).toBe(true);
    expect(offersKbUnit(974 * KB)).toBe(true);
  });

  it('[CTS-02] withholds KB once the floor is a megabyte or more', () => {
    // The reported case: a 19.97 MB report whose floor is 16.14 MB. KB is not
    // literally impossible there -- 16527 KB is valid -- but every reachable
    // KB value is five digits, so the unit only invites a rejected target.
    expect(offersKbUnit(16.14 * MB)).toBe(false);
    expect(offersKbUnit(MB)).toBe(false);
  });

  it('[CTS-03] rounds the smallest reachable target up, never down', () => {
    // 16.14 MB is not reachable at 16 MB: rounding down would name a target
    // the compressor must then refuse.
    expect(smallestReachableTarget(16.14 * MB, 'MB')).toBe(17);
    expect(smallestReachableTarget(200.5 * KB, 'KB')).toBe(201);
  });

  it('[CTS-04] never suggests a target of zero', () => {
    expect(smallestReachableTarget(0, 'MB')).toBe(1);
    expect(smallestReachableTarget(512, 'MB')).toBe(1);
  });
});
