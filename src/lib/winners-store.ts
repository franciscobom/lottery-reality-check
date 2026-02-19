import { Winner } from "@/types";

const MAX_WINNERS = 100;
const winners: Winner[] = [];

export function addWinner(winner: Winner): void {
  winners.unshift(winner);
  if (winners.length > MAX_WINNERS) {
    winners.pop();
  }
}

export function getWinners(lotteryType?: string): Winner[] {
  if (lotteryType) {
    return winners.filter((w) => w.lotteryType === lotteryType);
  }
  return [...winners];
}
