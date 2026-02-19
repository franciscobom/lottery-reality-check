"use client";

import { TallyState, GridConfig } from "@/types";

const GIVE_UP_THRESHOLD = 100_000;

interface TallyProps {
  tally: TallyState;
  config: GridConfig;
  giveUpProgress: number;
  giveUpReady: boolean;
  onGiveUp: () => void;
  givingUp: boolean;
  jackpotFound: boolean;
  onReset: () => void;
  gaveUp: boolean;
}

const LOSS_MESSAGES = [
  { threshold: 0,         message: "Ready to try your luck?" },
  { threshold: 5,         message: "Loosening up the finger." },
  { threshold: 10,        message: "Just getting started..." },
  { threshold: 20,        message: "That's a couple of scratch cards." },
  { threshold: 50,        message: "That's a nice lunch, gone." },
  { threshold: 75,        message: "Cheaper than therapy. Barely." },
  { threshold: 100,       message: "A week of coffee, wasted." },
  { threshold: 150,       message: "A proper night out with friends, drinks included." },
  { threshold: 200,       message: "A year of streaming, sacrificed." },
  { threshold: 300,       message: "A decent dinner out, never to be." },
  { threshold: 500,       message: "Could've been a weekend trip." },
  { threshold: 750,       message: "Halfway to something truly regrettable." },
  { threshold: 1000,      message: "There goes a month of groceries." },
  { threshold: 2000,      message: "Two months of groceries. Or one really good meal." },
  { threshold: 3000,      message: "That's a pretty solid TV." },
  { threshold: 5000,      message: "That's a vacation. Poof." },
  { threshold: 7500,      message: "You could've learned to fly a plane. Just saying." },
  { threshold: 10000,     message: "You could've bought a used car." },
  { threshold: 15000,     message: "Enough to hire a financial advisor. Ironic." },
  { threshold: 20000,     message: "That's two used cars. Or one decent one." },
  { threshold: 30000,     message: "More than a brand new car. Gone." },
  { threshold: 50000,     message: "A year's rent. Gone forever." },
  { threshold: 75000,     message: "Three-quarters of a house deposit." },
  { threshold: 100000,    message: "A full house deposit, burned to ash." },
  { threshold: 200000,    message: "Two house deposits. This is getting serious." },
  { threshold: 300000,    message: "That's a whole small house. Just... gone." },
  { threshold: 400000,    message: "A studio apartment in a nice city. Poof." },
  { threshold: 500000,    message: "Half a million. Let that sink in." },
  { threshold: 600000,    message: "You could've bought a castle turret." },
  { threshold: 700000,    message: "A private island. A very small one, but still." },
  { threshold: 800000,    message: "Eight hundred grand. Are you okay?" },
  { threshold: 900000,    message: "Almost a million. So close to being a different kind of fool." },
  { threshold: 1000000,   message: "A millionaire... in losses. Congratulations?" },
  { threshold: 2000000,   message: "Two million. We're well past 'quirky habit' territory." },
  { threshold: 3000000,   message: "Three million. More than most people earn in a lifetime." },
  { threshold: 4000000,   message: "Four million. Should we call someone?" },
  { threshold: 5000000,   message: "You could've funded a startup. A bad one, but still." },
  { threshold: 6000000,   message: "Six million. We've moved from concern to quiet admiration." },
  { threshold: 7000000,   message: "Seven million down. You are genuinely impressive." },
  { threshold: 8000000,   message: "Eight million. You're basically a hedge fund at this point." },
  { threshold: 9000000,   message: "Nine million. You might be the unluckiest person alive." },
  { threshold: 10000000,  message: "I'm not programmed to react beyond this. Please seek financial advice. (We still love you.)" },
];

function getLossMessage(netLoss: number): string {
  let message = LOSS_MESSAGES[0].message;
  for (const entry of LOSS_MESSAGES) {
    if (netLoss >= entry.threshold) {
      message = entry.message;
    }
  }
  return message;
}

export default function Tally({
  tally,
  config,
  giveUpProgress,
  giveUpReady,
  onGiveUp,
  givingUp,
  jackpotFound,
  onReset,
  gaveUp,
}: TallyProps) {
  const net = tally.won - tally.spent;
  const netLoss = Math.max(0, -net);
  const message = getLossMessage(netLoss);
  const remaining = GIVE_UP_THRESHOLD - tally.revealed;

  return (
    <div className="flex gap-3 sm:gap-4 p-2.5 sm:p-4 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 h-full">
      {/* Left: stats in two rows */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {/* Row 1: Spent / Won / Net — stacked on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-0.5 sm:gap-6">
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              Spent
            </span>
            <span className="text-red-400 font-mono text-sm sm:text-lg font-bold">
              {config.currency}{" "}
              {tally.spent.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              Won{gaveUp && <span className="text-red-400"> (GAVE UP)</span>}
            </span>
            <span className={`font-mono text-sm sm:text-lg font-bold ${gaveUp ? "text-slate-600 line-through" : "text-green-400"}`}>
              {config.currency}{" "}
              {tally.won.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            {tally.won > 10_000 && !gaveUp && (
              <span className="text-orange-400 font-mono text-[9px] sm:text-[10px] italic">
                Don&apos;t forget to pay your taxes! 💸
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              Net{gaveUp && <span className="text-red-400"> (GAVE UP)</span>}
            </span>
            <span
              className={`font-mono text-sm sm:text-lg font-bold ${
                gaveUp
                  ? "text-slate-600 line-through"
                  : net >= 0
                    ? "text-green-400"
                    : "text-red-400"
              }`}
            >
              {net >= 0 ? "+" : ""}
              {config.currency}{" "}
              {net.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Row 2: Tickets + Near Misses + message */}
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              Tickets
            </span>
            <span className="text-slate-300 font-mono text-sm sm:text-lg">
              {tally.revealed.toLocaleString("en-US")}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              Near Misses
            </span>
            <span className="text-purple-400 font-mono text-sm sm:text-lg font-bold">
              {tally.nearMisses}
            </span>
          </div>
          {tally.revealed > 0 && (
            <p className="text-slate-400 text-xs sm:text-sm font-mono italic">
              {message}
            </p>
          )}
        </div>
      </div>

      {/* Right: lottery info + progress bar + give up + reset */}
      <div className="flex flex-col items-end justify-between shrink-0">
        {/* Ticket/cost info — top right */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center text-slate-500 font-mono text-xs sm:gap-1.5">
          <span>{config.totalCombinations.toLocaleString()} tickets</span>
          <span className="hidden sm:inline">·</span>
          <span>{config.currency} {config.costPerPlay.toFixed(2)} each</span>
        </div>
        {/* Progress bar + buttons — bottom right */}
        <div className="flex flex-col items-end gap-1.5">
        <div className="w-full sm:w-36 h-3 sm:h-4 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${giveUpProgress * 100}%`,
              backgroundColor: "#2563eb",
            }}
          />
        </div>
        {/* Buttons — same size, side by side */}
        <div className="flex gap-1.5">
          <button
            onClick={onGiveUp}
            disabled={!giveUpReady || givingUp || jackpotFound}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all whitespace-nowrap ${
              giveUpReady && !jackpotFound
                ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
                : "bg-slate-800 text-slate-600 cursor-not-allowed"
            }`}
            title={
              giveUpReady
                ? "Reveal the winning combination"
                : `Reveal ${remaining.toLocaleString()} more tickets to unlock`
            }
          >
            {givingUp ? "..." : "GIVE UP"}
          </button>
          <button
            onClick={onReset}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg font-mono text-xs font-bold text-yellow-900 bg-yellow-500 hover:bg-yellow-400 transition-colors whitespace-nowrap"
          >
            Reset
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
