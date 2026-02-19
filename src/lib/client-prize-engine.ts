import { LotteryTier, RevealResult } from "@/types";
import { indexToCombination, LotteryCombination } from "@/lib/combination";

// ─── Pure-JS SHA-256 + HMAC-SHA256 ────────────────────────────────────────────
// Only used for deriveJackpotIndexBrowser; no longer used for prize computation.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const padLen = 64 - ((len + 9) % 64 || 64);
  const total = len + 1 + padLen + 8;
  const msg = new Uint8Array(total);
  msg.set(data);
  msg[len] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(total - 4, (len * 8) >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const W = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (W[i-15]>>>7|W[i-15]<<25) ^ (W[i-15]>>>18|W[i-15]<<14) ^ (W[i-15]>>>3);
      const s1 = (W[i-2]>>>17|W[i-2]<<15) ^ (W[i-2]>>>19|W[i-2]<<13) ^ (W[i-2]>>>10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let a=h0, b=h1, c=h2, d=h3, e=h4, f=h5, g=h6, h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (e>>>6|e<<26) ^ (e>>>11|e<<21) ^ (e>>>25|e<<7);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = (a>>>2|a<<30) ^ (a>>>13|a<<19) ^ (a>>>22|a<<10);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => ov.setUint32(i*4, v, false));
  return out;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const B = 64;
  const k = key.length > B ? sha256(key) : key;
  const kPad = new Uint8Array(B);
  kPad.set(k);
  const ipad = kPad.map(b => b ^ 0x36);
  const opad = kPad.map(b => b ^ 0x5c);
  const inner = new Uint8Array(B + data.length);
  inner.set(ipad); inner.set(data, B);
  const outer = new Uint8Array(B + 32);
  outer.set(opad); outer.set(sha256(inner), B);
  return sha256(outer);
}

const enc = new TextEncoder();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute prize results for a batch of combo indices using true match-based
 * lottery rules. Each ticket's prize tier is determined by how many of its
 * numbers match the jackpot combination — exactly like a real lottery.
 *
 * Tier 2 (one lucky star away from the jackpot) is flagged as nearMiss for
 * special visual treatment.
 */
export function checkCellsBrowser(
  jackpotCombo: LotteryCombination,
  indices: number[],  // combination-space indices
  tiers: LotteryTier[],
  mainPool: number,
  mainPick: number,
  bonusPool: number,
  bonusPick: number
): RevealResult[] {
  // Build match-key → { tierIndex, prize } lookup from tier definitions.
  // Each tier has a `match` string like "5+2", "4+1", etc.
  const matchLookup = new Map<string, { tierIndex: number; prize: number }>();
  for (let i = 0; i < tiers.length; i++) {
    matchLookup.set(tiers[i].match, { tierIndex: i, prize: tiers[i].prize });
  }

  const jackpotMainSet = new Set(jackpotCombo.main);
  const jackpotStarSet = new Set(jackpotCombo.stars);

  const results: RevealResult[] = [];

  for (const index of indices) {
    const combo = indexToCombination(index, mainPool, mainPick, bonusPool, bonusPick);

    let mainMatches = 0;
    for (const n of combo.main) {
      if (jackpotMainSet.has(n)) mainMatches++;
    }
    let starMatches = 0;
    for (const n of combo.stars) {
      if (jackpotStarSet.has(n)) starMatches++;
    }

    const key = `${mainMatches}+${starMatches}`;
    const tier = matchLookup.get(key);

    if (tier) {
      // Tier 2 (5+1 for EuroMillions) = one lucky star away from jackpot
      const nearMiss = tier.tierIndex === 1;
      results.push({ index, tierIndex: tier.tierIndex, prize: tier.prize, nearMiss });
    } else {
      results.push({ index, tierIndex: -1, prize: 0 });
    }
  }

  return results;
}

/**
 * Draw a random Mega Millions Megaplier (2×–10×) using the official distribution.
 * Applied to every non-jackpot winning ticket in Mega Millions games.
 */
export function drawMegaMultiplier(): number {
  const r = Math.random() * 75;
  if (r < 35) return 2;  // 46.7%
  if (r < 63) return 3;  // 37.3%
  if (r < 69) return 4;  // 8.0%
  if (r < 74) return 5;  // 6.7%
  return 10;              // 1.3%
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Derive deterministic shuffle parameters from the seed — HMAC-SHA256(seed, "shuffle")
 * → two 6-byte values → (a, b) for the linear shuffle. `a` is adjusted to be
 * coprime with totalCombinations so the shuffle is a bijection.
 */
export function deriveShuffleParamsBrowser(
  seed: string,
  totalCombinations: number
): { a: number; b: number } {
  const hash = hmacSha256(enc.encode(seed), enc.encode("shuffle"));
  const aRaw =
    hash[0] * 0x10000000000 + hash[1] * 0x100000000 +
    hash[2] * 0x1000000     + hash[3] * 0x10000 +
    hash[4] * 0x100          + hash[5];
  const bRaw =
    hash[6] * 0x10000000000 + hash[7] * 0x100000000 +
    hash[8] * 0x1000000     + hash[9] * 0x10000 +
    hash[10] * 0x100         + hash[11];
  let a = (aRaw % totalCombinations) || 1;
  while (gcd(a, totalCombinations) !== 1) {
    a = ((a + 1) % totalCombinations) || 1;
  }
  return { a, b: bRaw % totalCombinations };
}

/**
 * Derive the jackpot combo index from the seed — HMAC-SHA256(seed, "jackpot")
 * → first 6 bytes → mod total. Same derivation as the server.
 */
export function deriveJackpotIndexBrowser(
  seed: string,
  totalCombinations: number
): number {
  const sig = hmacSha256(enc.encode(seed), enc.encode("jackpot"));
  const value =
    sig[0] * 0x10000000000 +
    sig[1] * 0x100000000 +
    sig[2] * 0x1000000 +
    sig[3] * 0x10000 +
    sig[4] * 0x100 +
    sig[5];
  return value % totalCombinations;
}
