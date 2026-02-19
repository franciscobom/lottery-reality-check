import { LotteryConfig } from "@/types";

// EuroMillions: 50C5 * 12C2 = 139,838,160
// Grid: ceil(sqrt(139838160)) = 11826 → 11826 x 11826 = 139,854,276
// Last 16,116 cells are disabled (past totalCombinations)

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
};

export function getLotteryConfig(id: string): LotteryConfig | undefined {
  return LOTTERIES[id];
}

export function getDefaultLotteryId(): string {
  return "euromillions";
}
