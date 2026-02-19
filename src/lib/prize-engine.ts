import { createHmac } from "crypto";
import { LotteryTier, RevealResult } from "@/types";

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Derive shuffle parameters (A, B) from the session seed.
 * A is guaranteed coprime with total for a valid permutation.
 */
export function deriveShuffleParams(
  seed: string,
  totalCombinations: number
): { a: number; b: number } {
  const hash = createHmac("sha256", seed).update("shuffle").digest();
  const aRaw =
    hash[0] * 2 ** 40 +
    hash[1] * 2 ** 32 +
    hash[2] * 2 ** 24 +
    hash[3] * 2 ** 16 +
    hash[4] * 2 ** 8 +
    hash[5];
  const bRaw =
    hash[6] * 2 ** 40 +
    hash[7] * 2 ** 32 +
    hash[8] * 2 ** 24 +
    hash[9] * 2 ** 16 +
    hash[10] * 2 ** 8 +
    hash[11];

  let a = (aRaw % totalCombinations) || 1;
  while (gcd(a, totalCombinations) !== 1) {
    a = ((a + 1) % totalCombinations) || 1;
  }
  const b = bRaw % totalCombinations;
  return { a, b };
}

/**
 * Derive the jackpot position deterministically from the seed.
 * HMAC-SHA256(seed, "jackpot") → first 8 bytes as BigInt → mod totalCombinations
 */
export function deriveJackpotIndex(
  seed: string,
  totalCombinations: number
): number {
  const hmac = createHmac("sha256", seed);
  hmac.update("jackpot");
  const hash = hmac.digest();
  // Use first 6 bytes to get a number safely within JS integer range
  const value =
    hash[0] * 2 ** 40 +
    hash[1] * 2 ** 32 +
    hash[2] * 2 ** 24 +
    hash[3] * 2 ** 16 +
    hash[4] * 2 ** 8 +
    hash[5];
  return value % totalCombinations;
}

/**
 * For a given cell index, compute HMAC-SHA256(seed, index) to get a uniform
 * value in [0,1). Then check against cumulative probability thresholds.
 */
function hashCellToRandom(seed: string, index: number): number {
  const hmac = createHmac("sha256", seed);
  hmac.update(String(index));
  const hash = hmac.digest();
  // Use first 4 bytes to get a value in [0, 2^32), then divide by 2^32
  const value =
    (hash[0] * 2 ** 24 + hash[1] * 2 ** 16 + hash[2] * 2 ** 8 + hash[3]) >>>
    0;
  return value / 0x100000000;
}

/**
 * Build cumulative probability thresholds from tiers (skipping jackpot at index 0).
 * Tiers are checked rarest → most common.
 */
function buildThresholds(tiers: LotteryTier[]): number[] {
  const thresholds: number[] = [];
  let cumulative = 0;
  // Skip tier 0 (jackpot) - it's handled separately
  for (let i = 1; i < tiers.length; i++) {
    cumulative += tiers[i].probability;
    thresholds.push(cumulative);
  }
  return thresholds;
}

/**
 * Check a batch of cell indices and return their prize results.
 * O(1) per cell (HMAC + threshold scan over ~12 tiers).
 */
export function checkCells(
  seed: string,
  jackpotIndex: number,
  indices: number[],
  tiers: LotteryTier[],
  totalCombinations: number
): RevealResult[] {
  const thresholds = buildThresholds(tiers);

  return indices.map((index) => {
    // Out of bounds → no prize
    if (index < 0 || index >= totalCombinations) {
      return { index, tierIndex: -1, prize: 0 };
    }

    // Jackpot check
    if (index === jackpotIndex) {
      return { index, tierIndex: 0, prize: tiers[0].prize };
    }

    // Probabilistic check for other tiers
    const random = hashCellToRandom(seed, index);

    for (let i = 0; i < thresholds.length; i++) {
      if (random < thresholds[i]) {
        const tierIndex = i + 1; // +1 because we skipped jackpot
        return { index, tierIndex, prize: tiers[tierIndex].prize };
      }
    }

    // No prize
    return { index, tierIndex: -1, prize: 0 };
  });
}
