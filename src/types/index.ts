export interface LotteryTier {
  name: string;
  match: string;
  probability: number; // e.g. 1/139838160 for jackpot
  prize: number; // in the lottery's currency
}

export interface LotteryConfig {
  id: string;
  name: string;
  totalCombinations: number;
  gridCols: number;
  gridRows: number;
  costPerPlay: number;
  currency: string;
  mainPool: number;
  mainPick: number;
  bonusPool: number;
  bonusPick: number;
  bonusName: string;
  jackpotMin: number;
  jackpotMax: number;
  jackpotDefault: number;
  // How many tiers (from the top) scale proportionally when the jackpot changes.
  // Top-tier prizes are divided among very few winners so they genuinely track the
  // jackpot pool. Low-tier prizes are divided among many winners each draw, so they
  // stay roughly constant regardless of jackpot size.
  // European lotteries: 4 (jackpot + 3 near-jackpot tiers scale).
  // US lotteries: 1 (only the jackpot itself changes; secondary prizes are fixed).
  parimutuelTiers: number;
  perTicketMultiplier?: boolean; // true → Mega Millions random multiplier per ticket
  tiers: LotteryTier[];
}

export interface GridConfig {
  lotteryId: string;
  totalCombinations: number;
  gridCols: number;
  gridRows: number;
  costPerPlay: number;
  currency: string;
  lotteryName: string;
  mainPool: number;
  mainPick: number;
  bonusPool: number;
  bonusPick: number;
  bonusName: string;
  tiers: LotteryTier[];
  shuffleA: number;
  shuffleB: number;
  parimutuelTiers?: number;
  perTicketMultiplier?: boolean;
}

export interface RevealResult {
  index: number;
  tierIndex: number; // -1 = no prize, 0 = jackpot, 1..N = other tiers
  prize: number;
  nearMiss?: boolean;
}

export type CellState = "unrevealed" | "revealed-none" | "revealed-prize";

export interface RevealedCell {
  tierIndex: number;
  prize: number;
  nearMiss?: boolean;
}

export interface ViewportState {
  x: number; // world x offset (top-left of viewport in world coords)
  y: number;
  zoom: number; // pixels per cell
}

export enum ZoomLevel {
  Heatmap = 0, // < 0.1px per cell
  Pixel = 1, // 0.1-1px
  Medium = 2, // 1-8px
  Close = 3, // 8-40px
  Closest = 4, // > 40px
}

export interface TallyState {
  spent: number;
  won: number;
  revealed: number;
  nearMisses: number;
}
