/**
 * Grid shuffle: maps grid positions to combination indices and vice versa.
 * Uses a modular multiplicative permutation: f(x) = (A*x + B) mod N
 * where gcd(A, N) = 1, guaranteeing a bijection over [0, N).
 *
 * This scatters sequential combinations across the grid so near-misses
 * don't cluster around the jackpot.
 */

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [ONE, ZERO];
  while (r !== ZERO) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

/** Map a grid position to a combination index. */
export function gridToCombo(
  gridIndex: number,
  total: number,
  a: number,
  b: number
): number {
  const N = BigInt(total);
  return Number((BigInt(a) * BigInt(gridIndex) + BigInt(b)) % N);
}

/** Batch convert grid positions to combo indices (pre-converts BigInt once). */
export function gridToComboBatch(
  gridIndices: number[],
  total: number,
  a: number,
  b: number
): number[] {
  const N = BigInt(total);
  const A = BigInt(a);
  const B = BigInt(b);
  return gridIndices.map((gi) => Number((A * BigInt(gi) + B) % N));
}

/** Map a combination index back to its grid position. */
export function comboToGrid(
  comboIndex: number,
  total: number,
  a: number,
  b: number
): number {
  const N = BigInt(total);
  const aInv = modInverse(BigInt(a), N);
  return Number((aInv * ((BigInt(comboIndex) - BigInt(b) + N * TWO) % N)) % N);
}
