/**
 * Which target sizes a compressible document can honestly be asked for.
 *
 * The compress panels already know the floor -- the smallest output the most
 * aggressive preset can produce -- before the user types anything. These
 * helpers turn that number into the constraints the input should carry, so a
 * user learns the limit from the controls rather than from a rejected attempt.
 */

const KB = 1024;
const MB = 1024 * 1024;

export type SizeUnit = 'MB' | 'KB';

/**
 * Whether KB is worth offering as a target unit for a document with this floor.
 *
 * KB is never literally impossible -- 16527 KB is a valid way to say 16.14 MB --
 * so the rule cannot be "KB is unreachable". It is that once the floor reaches a
 * megabyte, every reachable KB value is a five-digit number nobody would type,
 * and offering the unit only invites a target the compressor must refuse.
 */
export function offersKbUnit(floorBytes: number): boolean {
  return floorBytes < MB;
}

/**
 * The smallest whole target, expressed in `unit`, that is actually reachable.
 *
 * Rounded up, never down: a floor of 16.14 MB is not met by a 16 MB target, so
 * rounding down would suggest a value the compressor then rejects.
 */
export function smallestReachableTarget(floorBytes: number, unit: SizeUnit): number {
  return Math.max(1, Math.ceil(floorBytes / (unit === 'MB' ? MB : KB)));
}
