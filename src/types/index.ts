export interface LotteryTier {
  name: string;
  match: string;
  probability: number; // e.g. 1/139838160 for jackpot
  prize: number; // in EUR
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
  tiers: LotteryTier[];
}

export interface GridConfig {
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
}

export interface SessionResponse {
  token: string;
  seed: string;
  config: GridConfig;
}

export interface RevealResult {
  index: number;
  tierIndex: number; // -1 = no prize, 0 = jackpot, 1..N = other tiers
  prize: number;
  nearMiss?: boolean;
}

export interface RevealResponse {
  results: RevealResult[];
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

export interface Winner {
  name: string;
  lotteryType: string;
  ticketsRevealed: number;
  amountSpent: number;
  timestamp: number;
}
