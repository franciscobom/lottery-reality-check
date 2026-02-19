/**
 * Bidirectional mapping between grid cell index and lottery combination.
 * Uses lexicographic ordering of k-subsets via the combinatorial number system.
 *
 * For EuroMillions: index = rank(main 5-from-50) * C(12,2) + rank(stars 2-from-12)
 * Index 0 = [1,2,3,4,5] + [1,2]
 * Index 139,838,159 = [46,47,48,49,50] + [11,12]
 */

// --- Binomial coefficient C(n,k) ---
const combCache = new Map<string, number>();

export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;

  const key = `${n},${k}`;
  const cached = combCache.get(key);
  if (cached !== undefined) return cached;

  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  result = Math.round(result);
  combCache.set(key, result);
  return result;
}

// --- Rank: sorted 1-indexed combination → lexicographic rank ---
function rankCombination(combo: number[], n: number): number {
  const k = combo.length;
  let rank = 0;
  let prev = 0;
  for (let i = 0; i < k; i++) {
    for (let j = prev + 1; j < combo[i]; j++) {
      rank += comb(n - j, k - i - 1);
    }
    prev = combo[i];
  }
  return rank;
}

// --- Unrank: lexicographic rank → sorted 1-indexed combination ---
function unrankCombination(rank: number, n: number, k: number): number[] {
  const result: number[] = [];
  let prev = 0;
  let remaining = rank;
  for (let i = 0; i < k; i++) {
    for (let a = prev + 1; a <= n; a++) {
      const count = comb(n - a, k - i - 1);
      if (remaining < count) {
        result.push(a);
        prev = a;
        break;
      }
      remaining -= count;
    }
  }
  return result;
}

// --- Public API ---

export interface LotteryCombination {
  main: number[];
  stars: number[];
}

/**
 * Convert a grid cell index to the corresponding lottery combination.
 */
export function indexToCombination(
  index: number,
  mainPool: number,
  mainPick: number,
  bonusPool: number,
  bonusPick: number
): LotteryCombination {
  const bonusCombos = comb(bonusPool, bonusPick);
  const mainRank = Math.floor(index / bonusCombos);
  const bonusRank = index % bonusCombos;
  return {
    main: unrankCombination(mainRank, mainPool, mainPick),
    stars: unrankCombination(bonusRank, bonusPool, bonusPick),
  };
}

/**
 * Convert a lottery combination to the corresponding grid cell index.
 * Returns -1 if the combination is invalid.
 */
export function combinationToIndex(
  main: number[],
  stars: number[],
  mainPool: number,
  mainPick: number,
  bonusPool: number,
  bonusPick: number
): number {
  if (main.length !== mainPick || stars.length !== bonusPick) return -1;

  const mainSorted = [...main].sort((a, b) => a - b);
  const starsSorted = [...stars].sort((a, b) => a - b);

  // Validate ranges
  for (const n of mainSorted) {
    if (n < 1 || n > mainPool || !Number.isInteger(n)) return -1;
  }
  for (const n of starsSorted) {
    if (n < 1 || n > bonusPool || !Number.isInteger(n)) return -1;
  }

  // Check for duplicates
  for (let i = 1; i < mainSorted.length; i++) {
    if (mainSorted[i] === mainSorted[i - 1]) return -1;
  }
  for (let i = 1; i < starsSorted.length; i++) {
    if (starsSorted[i] === starsSorted[i - 1]) return -1;
  }

  const bonusCombos = comb(bonusPool, bonusPick);
  const mainRank = rankCombination(mainSorted, mainPool);
  const starRank = rankCombination(starsSorted, bonusPool);

  return mainRank * bonusCombos + starRank;
}

/**
 * Format a combination for display.
 * e.g. "03 17 28 35 41 | ★04 ★09"
 */
export function formatCombination(combo: LotteryCombination): string {
  const mainStr = combo.main.map((n) => String(n).padStart(2, "0")).join(" ");
  const starsStr = combo.stars.map((n) => `\u272A${String(n).padStart(2, "0")}`).join(" ");
  return `${mainStr} | ${starsStr}`;
}

/**
 * Check if a cell is a "near miss" — its combination differs from the
 * jackpot by exactly one number (out of mainPick + bonusPick total).
 * Both combinations' arrays are sorted, so we merge-count matches.
 */
export function isNearMiss(
  index: number,
  jackpotCombo: LotteryCombination,
  mainPool: number,
  mainPick: number,
  bonusPool: number,
  bonusPick: number
): boolean {
  const combo = indexToCombination(index, mainPool, mainPick, bonusPool, bonusPick);

  let mainMatches = 0;
  let mi = 0, mj = 0;
  while (mi < combo.main.length && mj < jackpotCombo.main.length) {
    if (combo.main[mi] === jackpotCombo.main[mj]) { mainMatches++; mi++; mj++; }
    else if (combo.main[mi] < jackpotCombo.main[mj]) mi++;
    else mj++;
  }

  let starMatches = 0;
  let si = 0, sj = 0;
  while (si < combo.stars.length && sj < jackpotCombo.stars.length) {
    if (combo.stars[si] === jackpotCombo.stars[sj]) { starMatches++; si++; sj++; }
    else if (combo.stars[si] < jackpotCombo.stars[sj]) si++;
    else sj++;
  }

  return (mainMatches + starMatches) === (mainPick + bonusPick - 1);
}

/**
 * Precompute the set of all combo indices that are near-misses of the jackpot.
 * A near-miss differs by exactly 1 number. For EuroMillions (5+2), this yields
 * at most 5*49 + 2*11 = 267 entries — O(1) lookup vs O(k) per-cell isNearMiss.
 */
export function computeNearMissIndices(
  jackpotCombo: LotteryCombination,
  mainPool: number,
  mainPick: number,
  bonusPool: number,
  bonusPick: number
): Set<number> {
  const nearMisses = new Set<number>();

  // Vary each main number
  for (let pos = 0; pos < mainPick; pos++) {
    for (let val = 1; val <= mainPool; val++) {
      if (val === jackpotCombo.main[pos]) continue;
      if (jackpotCombo.main.includes(val)) continue;
      const newMain = [...jackpotCombo.main];
      newMain[pos] = val;
      newMain.sort((a, b) => a - b);
      const idx = combinationToIndex(
        newMain,
        jackpotCombo.stars,
        mainPool,
        mainPick,
        bonusPool,
        bonusPick
      );
      if (idx >= 0) nearMisses.add(idx);
    }
  }

  // Vary each star/bonus number
  for (let pos = 0; pos < bonusPick; pos++) {
    for (let val = 1; val <= bonusPool; val++) {
      if (val === jackpotCombo.stars[pos]) continue;
      if (jackpotCombo.stars.includes(val)) continue;
      const newStars = [...jackpotCombo.stars];
      newStars[pos] = val;
      newStars.sort((a, b) => a - b);
      const idx = combinationToIndex(
        jackpotCombo.main,
        newStars,
        mainPool,
        mainPick,
        bonusPool,
        bonusPick
      );
      if (idx >= 0) nearMisses.add(idx);
    }
  }

  return nearMisses;
}

/**
 * Format combination in a compact single-line form.
 * e.g. "03 17 28 35 41 + 04 09"
 */
export function formatCombinationCompact(combo: LotteryCombination): string {
  const mainStr = combo.main.map((n) => String(n).padStart(2, "0")).join(" ");
  const starsStr = combo.stars.map((n) => String(n).padStart(2, "0")).join(" ");
  return `${mainStr} + ${starsStr}`;
}
