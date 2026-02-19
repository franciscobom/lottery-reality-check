import { LotteryConfig } from "@/types";

// EuroMillions: 50C5 * 12C2 = 139,838,160
// Grid: ceil(sqrt(139838160)) = 11826 → 11826 x 11826 = 139,854,276
// Last 16,116 cells are disabled (past totalCombinations)

// Powerball: 69C5 * 26 = 292,201,338
// Grid: ceil(sqrt(292201338)) = 17095 → 17095 x 17095 = 292,239,025

// Mega Millions: 70C5 * 24 = 290,472,336
// Grid: ceil(sqrt(290472336)) = 17044 → 17044 x 17044 = 290,498,736

export const LOTTERIES: Record<string, LotteryConfig> = {
  euromillions: {
    id: "euromillions",
    name: "EuroMillions",
    totalCombinations: 139_838_160,
    gridCols: 11_826,
    gridRows: 11_826,
    costPerPlay: 2.5,
    currency: "EUR",
    mainPool: 50,
    mainPick: 5,
    bonusPool: 12,
    bonusPick: 2,
    bonusName: "Stars",
    jackpotMin: 17_000_000,
    jackpotMax: 250_000_000,
    jackpotDefault: 75_000_000,
    parimutuelTiers: 4, // jackpot + 5+1 + 5+0 + 4+2 scale; lower tiers are stable
    tiers: [
      {
        name: "Jackpot",
        match: "5+2",
        probability: 1 / 139_838_160,
        prize: 17_000_000,
      },
      {
        name: "Tier 2",
        match: "5+1",
        probability: 1 / 6_991_908,
        prize: 300_000,
      },
      {
        name: "Tier 3",
        match: "5+0",
        probability: 1 / 3_107_515,
        prize: 50_000,
      },
      {
        name: "Tier 4",
        match: "4+2",
        probability: 1 / 621_503,
        prize: 3_000,
      },
      {
        name: "Tier 5",
        match: "4+1",
        probability: 1 / 31_075,
        prize: 150,
      },
      {
        name: "Tier 6",
        match: "3+2",
        probability: 1 / 14_125,
        prize: 75,
      },
      {
        name: "Tier 7",
        match: "4+0",
        probability: 1 / 13_811,
        prize: 50,
      },
      {
        name: "Tier 8",
        match: "2+2",
        probability: 1 / 985,
        prize: 15,
      },
      {
        name: "Tier 9",
        match: "3+1",
        probability: 1 / 706,
        prize: 12,
      },
      {
        name: "Tier 10",
        match: "3+0",
        probability: 1 / 314,
        prize: 10,
      },
      {
        name: "Tier 11",
        match: "1+2",
        probability: 1 / 188,
        prize: 8,
      },
      {
        name: "Tier 12",
        match: "2+1",
        probability: 1 / 49,
        prize: 5,
      },
      {
        name: "Tier 13",
        match: "2+0",
        probability: 1 / 22,
        prize: 3,
      },
    ],
  },

  eurojackpot: {
    id: "eurojackpot",
    name: "EuroJackpot",
    totalCombinations: 139_838_160,
    gridCols: 11_826,
    gridRows: 11_826,
    costPerPlay: 2.0,
    currency: "EUR",
    mainPool: 50,
    mainPick: 5,
    bonusPool: 12,
    bonusPick: 2,
    bonusName: "Euro Numbers",
    jackpotMin: 10_000_000,
    jackpotMax: 120_000_000,
    jackpotDefault: 45_000_000,
    parimutuelTiers: 4, // jackpot + 5+1 + 5+0 + 4+2 scale; lower tiers are stable
    tiers: [
      {
        name: "Jackpot",
        match: "5+2",
        probability: 1 / 139_838_160,
        prize: 10_000_000,
      },
      {
        name: "Tier 2",
        match: "5+1",
        probability: 1 / 6_991_908,
        prize: 750_000,
      },
      {
        name: "Tier 3",
        match: "5+0",
        probability: 1 / 3_107_515,
        prize: 192_000,
      },
      {
        name: "Tier 4",
        match: "4+2",
        probability: 1 / 621_503,
        prize: 4_500,
      },
      {
        name: "Tier 5",
        match: "4+1",
        probability: 1 / 31_075,
        prize: 200,
      },
      {
        name: "Tier 6",
        match: "4+0",
        probability: 1 / 13_811,
        prize: 55,
      },
      {
        name: "Tier 7",
        match: "3+2",
        probability: 1 / 14_125,
        prize: 35,
      },
      {
        name: "Tier 8",
        match: "2+2",
        probability: 1 / 985,
        prize: 16,
      },
      {
        name: "Tier 9",
        match: "3+1",
        probability: 1 / 706,
        prize: 12,
      },
      {
        name: "Tier 10",
        match: "3+0",
        probability: 1 / 314,
        prize: 10,
      },
      {
        name: "Tier 11",
        match: "1+2",
        probability: 1 / 188,
        prize: 8,
      },
      {
        name: "Tier 12",
        match: "2+1",
        probability: 1 / 49,
        prize: 5,
      },
    ],
  },

  powerball: {
    id: "powerball",
    name: "Powerball",
    totalCombinations: 292_201_338,
    gridCols: 17_095,
    gridRows: 17_095,
    costPerPlay: 2.0,
    currency: "USD",
    mainPool: 69,
    mainPick: 5,
    bonusPool: 26,
    bonusPick: 1,
    bonusName: "Powerball",
    // All amounts are lump sum (cash option) values.
    // Record cash payout: $997.6M (from the $2.04B annuity jackpot, Nov 2022).
    jackpotMin: 10_000_000,
    jackpotMax: 1_000_000_000,
    jackpotDefault: 75_000_000,
    parimutuelTiers: 1, // only jackpot changes; all secondary prizes are fixed
    tiers: [
      {
        name: "Jackpot",
        match: "5+1",
        probability: 1 / 292_201_338,
        prize: 10_000_000, // lump sum of minimum starting jackpot
      },
      {
        name: "Tier 2",
        match: "5+0",
        probability: 1 / 11_688_054,
        prize: 1_000_000,
      },
      {
        name: "Tier 3",
        match: "4+1",
        probability: 1 / 913_129,
        prize: 50_000,
      },
      {
        name: "Tier 4",
        match: "4+0",
        probability: 1 / 36_525,
        prize: 100,
      },
      {
        name: "Tier 5",
        match: "3+1",
        probability: 1 / 14_494,
        prize: 100,
      },
      {
        name: "Tier 6",
        match: "3+0",
        probability: 1 / 580,
        prize: 7,
      },
      {
        name: "Tier 7",
        match: "2+1",
        probability: 1 / 701,
        prize: 7,
      },
      {
        name: "Tier 8",
        match: "1+1",
        probability: 1 / 92,
        prize: 4,
      },
      {
        name: "Tier 9",
        match: "0+1",
        probability: 1 / 38,
        prize: 4,
      },
    ],
  },

  megamillions: {
    id: "megamillions",
    name: "Mega Millions",
    totalCombinations: 290_472_336,
    gridCols: 17_044,
    gridRows: 17_044,
    costPerPlay: 5.0,
    currency: "USD",
    mainPool: 70,
    mainPick: 5,
    bonusPool: 24,
    bonusPick: 1,
    bonusName: "Megaball",
    // All amounts are lump sum (cash option) values.
    // Record cash payout: ~$794M (from the $1.602B annuity jackpot, Aug 2023).
    jackpotMin: 10_000_000,
    jackpotMax: 800_000_000,
    jackpotDefault: 100_000_000,
    parimutuelTiers: 1, // only jackpot changes; all secondary prizes are fixed base amounts
    perTicketMultiplier: true,
    tiers: [
      {
        name: "Jackpot",
        match: "5+1",
        probability: 1 / 290_472_336,
        prize: 10_000_000, // lump sum of minimum starting jackpot
      },
      {
        name: "Tier 2",
        match: "5+0",
        probability: 1 / 12_607_306,
        prize: 1_000_000,
      },
      {
        name: "Tier 3",
        match: "4+1",
        probability: 1 / 931_001,
        prize: 10_000,
      },
      {
        name: "Tier 4",
        match: "4+0",
        probability: 1 / 38_792,
        prize: 500,
      },
      {
        name: "Tier 5",
        match: "3+1",
        probability: 1 / 14_547,
        prize: 200,
      },
      {
        name: "Tier 6",
        match: "3+0",
        probability: 1 / 606,
        prize: 10,
      },
      {
        name: "Tier 7",
        match: "2+1",
        probability: 1 / 693,
        prize: 10,
      },
      {
        name: "Tier 8",
        match: "1+1",
        probability: 1 / 89,
        prize: 4,
      },
      {
        name: "Tier 9",
        match: "0+1",
        probability: 1 / 37,
        prize: 2,
      },
    ],
  },
};

export function getLotteryConfig(id: string): LotteryConfig | undefined {
  return LOTTERIES[id];
}

export function getDefaultLotteryId(): string {
  return "euromillions";
}
