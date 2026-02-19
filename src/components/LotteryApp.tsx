"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  GridConfig,
  ViewportState,
  RevealedCell,
  RevealResult,
  TallyState,
} from "@/types";
import GridCanvas, { GridCanvasHandle } from "./GridCanvas";
import Tally from "./Tally";
import LotterySelector from "./LotterySelector";
import Minimap from "./Minimap";
import CombinationInput, { CombinationInputHandle } from "./CombinationInput";
import JackpotBanner from "./JackpotBanner";
import { initAudio, playRevealTick, playNearMissPing } from "@/lib/sounds";
import {
  LotteryCombination,
  indexToCombination,
} from "@/lib/combination";
import { gridToCombo, gridToComboBatch } from "@/lib/grid-shuffle";
import {
  checkCellsBrowser,
  deriveJackpotIndexBrowser,
  deriveShuffleParamsBrowser,
  drawMegaMultiplier,
} from "@/lib/client-prize-engine";
import { getLotteryConfig } from "@/lib/lottery-config";

const GIVE_UP_THRESHOLD = 100_000;

const LOTTERY_ORDER = ["euromillions", "eurojackpot", "powerball", "megamillions"];

const LOTTERY_FLAGS: Record<string, string> = {
  euromillions: "🇪🇺",
  eurojackpot: "🇪🇺",
  powerball: "🇺🇸",
  megamillions: "🇺🇸",
};

const LOTTERY_DESCRIPTIONS: Record<string, string> = {
  euromillions:
    "Europe's flagship multi-national lottery. Pick 5 from 50 + 2 Lucky Stars from 12. The jackpot and top 3 prize tiers scale with the jackpot; smaller prizes are stable.",
  eurojackpot:
    "Jackpots up to €120M across 18 European countries. Pick 5 from 50 + 2 Euro Numbers from 12. The jackpot and top 3 prize tiers scale; smaller prizes are stable.",
  powerball:
    "America's most famous jackpot lottery. Pick 5 from 69 + 1 Powerball from 26. All secondary prizes are fixed. Jackpot shown as lump sum (cash option) — and don't forget taxes.",
  megamillions:
    "America's other giant. Pick 5 from 70 + 1 Megaball from 24. Fixed secondary prizes, every ticket includes the Megaplier (2×–10×). Jackpot shown as lump sum — and don't forget taxes.",
};

function formatJackpot(amount: number, currency: string): string {
  const symbol = currency === "EUR" ? "€" : "$";
  if (amount >= 1_000_000_000) {
    return `${symbol}${(amount / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  }
  return `${symbol}${Math.round(amount / 1_000_000)}M`;
}

function formatOdds(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return n.toLocaleString();
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function LotteryApp() {
  const [lotteryType, setLotteryType] = useState("euromillions");
  const [jackpotAmount, setJackpotAmount] = useState<number>(0); // 0 = use lottery's default
  const [showJackpotEdit, setShowJackpotEdit] = useState(false);
  const [pendingJackpotAmount, setPendingJackpotAmount] = useState(0);

  const [seed, setSeed] = useState<string | null>(null);
  const [config, setConfig] = useState<GridConfig | null>(null);
  const [revealedCells, setRevealedCells] = useState<Map<number, RevealedCell>>(
    () => new Map()
  );
  const [tally, setTally] = useState<TallyState>({
    spent: 0,
    won: 0,
    revealed: 0,
    nearMisses: 0,
  });
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0,
    y: 0,
    zoom: 50,
  });
  const [isRevealing, setIsRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [headerCopied, setHeaderCopied] = useState(false);

  // Jackpot / Give-up state
  const [jackpotFound, setJackpotFound] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [jackpotCombination, setJackpotCombination] =
    useState<LotteryCombination | null>(null);
  const [givingUp, setGivingUp] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const gridRef = useRef<GridCanvasHandle>(null);
  const comboInputRef = useRef<CombinationInputHandle>(null);
  const revealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gaveUpRef = useRef(false);
  const jackpotComboRef = useRef<LotteryCombination | null>(null);

  // Keep ref in sync for use inside closures
  gaveUpRef.current = gaveUp;

  // Current lottery's static config (for jackpot slider, etc.)
  const lotteryConfig = getLotteryConfig(lotteryType);
  const effectiveJackpot = jackpotAmount || (lotteryConfig?.jackpotDefault ?? 0);

  // Derive config with scaled tier prizes based on chosen jackpot amount.
  // Uses config.lotteryId (not lotteryType state) to avoid race conditions.
  //
  // parimutuelTiers controls how many top tiers scale with the jackpot:
  //   European lotteries: 4 — jackpot + the three near-jackpot tiers (5+1, 5+0, 4+2)
  //     track the prize pool because they have very few winners per draw.
  //     The remaining tiers have many winners per draw, so prize-per-winner stays
  //     roughly constant regardless of jackpot size.
  //   US lotteries: 1 — only the jackpot itself changes; all secondary prizes are fixed.
  const effectiveConfig = useMemo<GridConfig | null>(() => {
    if (!config) return null;
    const lc = getLotteryConfig(config.lotteryId);
    if (!lc) return config;

    const amount = jackpotAmount || lc.jackpotDefault;
    const scaleFactor = amount / lc.tiers[0].prize;
    const scaledCount = lc.parimutuelTiers;

    return {
      ...config,
      tiers: config.tiers.map((t, i) =>
        i < scaledCount ? { ...t, prize: Math.round(t.prize * scaleFactor) } : t
      ),
    };
  }, [config, jackpotAmount]);

  // Show banner when jackpot is found
  useEffect(() => {
    if (jackpotFound && jackpotCombination) {
      setShowBanner(true);
    }
  }, [jackpotFound, jackpotCombination]);

  // Create a new session entirely client-side — no network required.
  // Web Crypto CSPRNG (crypto.getRandomValues) is equally secure to Node's randomBytes.
  const initSession = useCallback((type: string) => {
    const lc = getLotteryConfig(type);
    if (!lc) return;

    revealTimeoutsRef.current.forEach(clearTimeout);
    revealTimeoutsRef.current = [];

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newSeed = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

    const { a: shuffleA, b: shuffleB } = deriveShuffleParamsBrowser(newSeed, lc.totalCombinations);
    const jackpotIndex = deriveJackpotIndexBrowser(newSeed, lc.totalCombinations);
    const combo = indexToCombination(jackpotIndex, lc.mainPool, lc.mainPick, lc.bonusPool, lc.bonusPick);

    const gridConfig: GridConfig = {
      lotteryId: lc.id,
      totalCombinations: lc.totalCombinations,
      gridCols: lc.gridCols,
      gridRows: lc.gridRows,
      costPerPlay: lc.costPerPlay,
      currency: lc.currency,
      lotteryName: lc.name,
      mainPool: lc.mainPool,
      mainPick: lc.mainPick,
      bonusPool: lc.bonusPool,
      bonusPick: lc.bonusPick,
      bonusName: lc.bonusName,
      tiers: lc.tiers,
      shuffleA,
      shuffleB,
      parimutuelTiers: lc.parimutuelTiers,
      perTicketMultiplier: lc.perTicketMultiplier,
    };

    jackpotComboRef.current = combo;
    setSeed(newSeed);
    setConfig(gridConfig);
    setRevealedCells(new Map());
    setTally({ spent: 0, won: 0, revealed: 0, nearMisses: 0 });
    setIsRevealing(false);
    setJackpotFound(false);
    setGaveUp(false);
    setJackpotCombination(null);
    setShowBanner(false);
  }, []);

  const handleLotteryChange = useCallback((id: string) => {
    setLotteryType(id);
    setJackpotAmount(0);
    if (!showIntro) initSession(id);
  }, [showIntro, initSession]);

  const handleReset = useCallback(() => {
    initSession(lotteryType);
  }, [lotteryType, initSession]);

  const handleApplyJackpot = useCallback(() => {
    setShowJackpotEdit(false);
    if (pendingJackpotAmount === effectiveJackpot) return;
    if (tally.revealed > 0) {
      if (
        window.confirm(
          "Changing the jackpot will reset your progress. Continue?"
        )
      ) {
        setJackpotAmount(pendingJackpotAmount);
        handleReset();
      }
    } else {
      setJackpotAmount(pendingJackpotAmount);
    }
  }, [pendingJackpotAmount, effectiveJackpot, tally.revealed, handleReset]);

  // Handle selection complete → batch reveal (client-side)
  const handleSelectionComplete = useCallback(
    async (indices: number[]) => {
      if (!jackpotComboRef.current || !effectiveConfig || isRevealing) return;

      try {
        // Convert grid indices → combo indices
        const comboIndices = gridToComboBatch(
          indices,
          effectiveConfig.totalCombinations,
          effectiveConfig.shuffleA,
          effectiveConfig.shuffleB
        );

        // Compute prizes client-side via true match-based rules
        const rawResults = checkCellsBrowser(
          jackpotComboRef.current!,
          comboIndices,
          effectiveConfig.tiers,
          effectiveConfig.mainPool,
          effectiveConfig.mainPick,
          effectiveConfig.bonusPool,
          effectiveConfig.bonusPick
        );

        // Map results back to grid indices
        const results: RevealResult[] = rawResults.map((r, i) => ({
          index: indices[i],
          tierIndex: r.tierIndex,
          prize: r.prize,
          nearMiss: r.nearMiss,
        }));

        // Apply Mega Millions per-ticket Megaplier to non-jackpot wins
        if (effectiveConfig.perTicketMultiplier) {
          for (const r of results) {
            if (r.tierIndex > 0 && r.prize > 0) {
              r.prize = Math.round(r.prize * drawMegaMultiplier());
            }
          }
        }

        const shuffled = fisherYatesShuffle(results);

        // Scale total duration: instant for 1 cell, fast for <10, sqrt curve for rest
        const count = shuffled.length;
        const totalMs =
          count <= 1
            ? 0
            : count < 10
            ? count * 120
            : Math.min(30000, 500 * Math.sqrt(count));

        // Only show the "Revealing…" overlay when there is a real animation delay
        if (totalMs > 0) setIsRevealing(true);
        const TICK_MS = 16;
        const numTicks = Math.max(1, Math.ceil(totalMs / TICK_MS));

        // Assign each cell to a proportional tick
        const tickBatches: { batch: RevealResult[]; ms: number }[] = [];
        let prevEnd = 0;
        for (let t = 0; t < numTicks; t++) {
          const startIdx = prevEnd;
          const endIdx = Math.floor(((t + 1) / numTicks) * shuffled.length);
          if (endIdx > startIdx) {
            tickBatches.push({
              batch: shuffled.slice(startIdx, endIdx),
              ms: Math.round((t / numTicks) * totalMs),
            });
            prevEnd = endIdx;
          }
        }

        // Skip flip animation for large reveals (>1000 cells total)
        const animateFlip = count <= 1000;

        tickBatches.forEach(({ batch, ms }, i) => {
          const isLast = i === tickBatches.length - 1;
          const timeout = setTimeout(() => {
            // Sound logic
            let lossCount = 0;
            let winCount = 0;
            let hasNearMiss = false;
            let hasJackpot = false;
            let bestHighTier: number | null = null;
            for (const r of batch) {
              if (r.nearMiss) { hasNearMiss = true; continue; }
              if (r.tierIndex === 0) { hasJackpot = true; continue; }
              if (r.tierIndex >= 1 && r.tierIndex <= 4) {
                winCount++;
                if (bestHighTier === null || r.tierIndex < bestHighTier)
                  bestHighTier = r.tierIndex;
              } else if (r.tierIndex > 4) winCount++;
              else lossCount++;
            }
            if (bestHighTier !== null) playRevealTick(bestHighTier);
            else if (winCount > lossCount) playRevealTick(5);
            else if (lossCount > 0 || winCount > 0) playRevealTick(-1);
            if (hasJackpot) playRevealTick(0);
            else if (hasNearMiss) playNearMissPing();

            gridRef.current?.revealCells(
              batch.map((r) => r.index),
              animateFlip
            );

            setRevealedCells((prev) => {
              const next = new Map(prev);
              for (const r of batch) {
                next.set(r.index, {
                  tierIndex: r.tierIndex,
                  prize: r.prize,
                  nearMiss: r.nearMiss,
                });
              }
              return next;
            });

            setTally((prev) => {
              let addSpent = 0, addWon = 0, addNearMisses = 0;
              for (const r of batch) {
                addSpent += effectiveConfig.costPerPlay;
                addWon += r.prize;
                if (r.nearMiss) addNearMisses++;
              }
              return {
                spent: prev.spent + addSpent,
                won: prev.won + addWon,
                revealed: prev.revealed + batch.length,
                nearMisses: prev.nearMisses + addNearMisses,
              };
            });

            // Jackpot detection
            for (const r of batch) {
              if (r.tierIndex === 0 && !gaveUpRef.current) {
                const comboIdx = gridToCombo(
                  r.index,
                  effectiveConfig.totalCombinations,
                  effectiveConfig.shuffleA,
                  effectiveConfig.shuffleB
                );
                const combo = indexToCombination(
                  comboIdx,
                  effectiveConfig.mainPool,
                  effectiveConfig.mainPick,
                  effectiveConfig.bonusPool,
                  effectiveConfig.bonusPick
                );
                setJackpotCombination(combo);
                setJackpotFound(true);
              }
            }

            if (isLast) setIsRevealing(false);
          }, ms);

          revealTimeoutsRef.current.push(timeout);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reveal failed");
        setIsRevealing(false);
      }
    },
    [effectiveConfig, isRevealing]
  );

  const handleViewportChange = useCallback((vp: ViewportState) => {
    setViewport(vp);
  }, []);

  const handleMinimapNavigate = useCallback(
    (worldX: number, worldY: number) => {
      gridRef.current?.navigateTo(worldX, worldY);
    },
    []
  );

  // Handle reveal from CombinationInput
  const handleCombinationReveal = useCallback(
    (index: number, result: RevealResult) => {
      if (result.nearMiss) playNearMissPing();
      else playRevealTick(result.tierIndex);

      gridRef.current?.revealCells([index], true);

      setRevealedCells((prev) => {
        const next = new Map(prev);
        next.set(index, {
          tierIndex: result.tierIndex,
          prize: result.prize,
          nearMiss: result.nearMiss,
        });
        return next;
      });

      if (effectiveConfig) {
        setTally((prev) => ({
          spent: prev.spent + effectiveConfig.costPerPlay,
          won: prev.won + result.prize,
          revealed: prev.revealed + 1,
          nearMisses: prev.nearMisses + (result.nearMiss ? 1 : 0),
        }));
      }

      // Jackpot detection from combination input
      if (result.tierIndex === 0 && effectiveConfig) {
        const comboIdx = gridToCombo(
          index,
          effectiveConfig.totalCombinations,
          effectiveConfig.shuffleA,
          effectiveConfig.shuffleB
        );
        const combo = indexToCombination(
          comboIdx,
          effectiveConfig.mainPool,
          effectiveConfig.mainPick,
          effectiveConfig.bonusPool,
          effectiveConfig.bonusPick
        );
        setJackpotCombination(combo);
        setJackpotFound(true);
      }
    },
    [effectiveConfig]
  );

  // Navigate grid to a specific cell
  const handleNavigateToCell = useCallback((index: number) => {
    gridRef.current?.navigateToCell(index);
  }, []);

  // Give Up: reveal the jackpot combination (derived client-side from seed)
  const handleGiveUp = useCallback(() => {
    if (!jackpotComboRef.current || givingUp) return;
    setGivingUp(true);
    setGaveUp(true);
    gaveUpRef.current = true;
    const { main, stars } = jackpotComboRef.current;
    comboInputRef.current?.setAndSubmit(main, stars);
    setGivingUp(false);
  }, [givingUp]);

  const handleBannerClose = useCallback(() => {
    setShowBanner(false);
  }, []);

  const handleHeaderShare = useCallback(() => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      navigator.share({ title: "Face the Odds", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setHeaderCopied(true);
        setTimeout(() => setHeaderCopied(false), 2000);
      });
    }
  }, []);

  // Progress toward give-up threshold
  const giveUpProgress = Math.min(tally.revealed / GIVE_UP_THRESHOLD, 1);
  const giveUpReady = tally.revealed >= GIVE_UP_THRESHOLD;

  // Intro is its own full-screen page — no session created until the user clicks Start
  if (showIntro) {
    const introLc = getLotteryConfig(lotteryType)!;
    const introAmount = jackpotAmount || introLc.jackpotDefault;
    const introStep = introLc.jackpotMax > 500_000_000 ? 10_000_000 : 1_000_000;
    return (
      <div className="flex items-start justify-center min-h-screen bg-slate-950 overflow-y-auto py-4">
        <div className="max-w-lg w-full mx-4 p-6 bg-slate-900 rounded-2xl border border-slate-700">
          <h1 className="text-3xl font-bold text-slate-100 font-mono mb-3">
            Face the Odds
          </h1>
          <hr className="border-white mb-4" />
          <h2 className="text-xl font-bold text-slate-100 font-mono mb-2">
            Pick your poison.
          </h2>
          <p className="text-slate-400 font-mono text-sm mb-5">
            {LOTTERY_DESCRIPTIONS[lotteryType]}
          </p>

          {/* Lottery cards — 2×2 grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {LOTTERY_ORDER.map((id) => {
              const lc = getLotteryConfig(id)!;
              const isSelected = lotteryType === id;
              return (
                <button
                  key={id}
                  onClick={() => handleLotteryChange(id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-amber-500 bg-amber-950/30 shadow-amber-500/20 shadow-md"
                      : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-100 font-mono text-sm">
                      {lc.name}
                    </span>
                    <span>{LOTTERY_FLAGS[id]}</span>
                  </div>
                  <div className="text-slate-400 font-mono text-xs">
                    1 in {formatOdds(lc.totalCombinations)}
                  </div>
                  <div className="text-slate-400 font-mono text-xs">
                    {lc.currency === "EUR" ? "€" : "$"}
                    {lc.costPerPlay.toFixed(2)} per play
                  </div>
                </button>
              );
            })}
          </div>

          {/* Jackpot slider */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 font-mono text-sm font-bold">
                Jackpot
              </span>
              <span className="text-amber-400 font-bold font-mono text-lg">
                {formatJackpot(introAmount, introLc.currency)}
              </span>
            </div>
            <input
              type="range"
              min={introLc.jackpotMin}
              max={introLc.jackpotMax}
              step={introStep}
              value={introAmount}
              onChange={(e) => setJackpotAmount(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-slate-500 font-mono text-xs mt-1">
              <span>{formatJackpot(introLc.jackpotMin, introLc.currency)}</span>
              <span>
                {formatJackpot(introLc.jackpotDefault, introLc.currency)} avg. jackpot
              </span>
              <span>{formatJackpot(introLc.jackpotMax, introLc.currency)}</span>
            </div>
          </div>

          <p className="text-slate-500 font-mono text-xs mb-5">
            Shift+Drag (or toggle selection mode) to reveal tickets. Type in
            your lucky numbers. Every single possible combination is here.
            Exactly{" "}
            <span className="text-amber-400 font-bold">one</span> of them wins.
          </p>

          <button
            onClick={() => {
              initAudio();
              initSession(lotteryType);
              setShowIntro(false);
            }}
            className="w-full bg-amber-600 text-white px-6 py-3 rounded-lg font-mono font-bold hover:bg-amber-500 transition-colors"
          >
            Start Wasting Money
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-4">
        <div className="text-red-400 font-mono text-lg">{error}</div>
        <button
          onClick={() => initSession(lotteryType)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-mono hover:bg-blue-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!effectiveConfig || seed === null || !jackpotComboRef.current)
    return null;

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm z-20">
        <div className="flex items-center gap-2 sm:gap-4">
          <h1 className="text-sm sm:text-lg font-bold text-slate-100 font-mono">
            Face the Odds
          </h1>
          <LotterySelector
            currentLottery={lotteryType}
            onSelect={handleLotteryChange}
          />
        </div>

        {/* Mobile share button */}
        <button
          onClick={handleHeaderShare}
          className="sm:hidden px-2.5 py-1.5 rounded-lg font-mono text-xs text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          {headerCopied ? "Copied!" : "Share"}
        </button>

          {/* Jackpot display + edit popover (desktop only) */}
          {lotteryConfig && (
            <div className="relative hidden sm:flex items-center gap-1.5">
              <span className="text-slate-400 font-mono text-xs">
                Jackpot:{" "}
                <span className="text-amber-400 font-bold">
                  {formatJackpot(effectiveJackpot, lotteryConfig.currency)}
                </span>
              </span>
              <button
                onClick={() => {
                  setPendingJackpotAmount(effectiveJackpot);
                  setShowJackpotEdit(true);
                }}
                className="text-slate-500 hover:text-slate-300 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
              >
                Edit
              </button>
              {showJackpotEdit && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl p-4 w-64 shadow-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-300 font-mono text-sm font-bold">
                      Jackpot
                    </span>
                    <span className="text-amber-400 font-bold font-mono text-sm">
                      {formatJackpot(
                        pendingJackpotAmount,
                        lotteryConfig.currency
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={lotteryConfig.jackpotMin}
                    max={lotteryConfig.jackpotMax}
                    step={
                      lotteryConfig.jackpotMax > 500_000_000
                        ? 10_000_000
                        : 1_000_000
                    }
                    value={pendingJackpotAmount}
                    onChange={(e) =>
                      setPendingJackpotAmount(Number(e.target.value))
                    }
                    className="w-full accent-amber-500 mb-1"
                  />
                  <div className="flex justify-between text-slate-600 font-mono text-xs mb-3">
                    <span>
                      {formatJackpot(
                        lotteryConfig.jackpotMin,
                        lotteryConfig.currency
                      )}
                    </span>
                    <span>
                      {formatJackpot(
                        lotteryConfig.jackpotMax,
                        lotteryConfig.currency
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleApplyJackpot}
                      className="flex-1 bg-amber-600 text-white py-1.5 rounded-lg font-mono text-xs font-bold hover:bg-amber-500 transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setShowJackpotEdit(false)}
                      className="flex-1 bg-slate-700 text-slate-300 py-1.5 rounded-lg font-mono text-xs hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

      </header>

      {/* Tally bar + Combination input */}
      <div className="px-2 sm:px-4 py-2 z-10 flex gap-2 sm:gap-4 items-stretch flex-wrap">
        <div className="flex-1 min-w-[240px] sm:min-w-[300px]">
          <Tally
            tally={tally}
            config={effectiveConfig}
            giveUpProgress={giveUpProgress}
            giveUpReady={giveUpReady}
            onGiveUp={handleGiveUp}
            givingUp={givingUp}
            jackpotFound={jackpotFound}
            onReset={handleReset}
            gaveUp={gaveUp}
          />
        </div>
        <div className="flex flex-col gap-1 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 p-2 sm:p-3 justify-start">
          <span className="text-slate-200 text-xs sm:text-sm font-mono uppercase tracking-wider font-bold">
            Try your lucky combination
          </span>
          <CombinationInput
            key={seed ?? lotteryType}
            ref={comboInputRef}
            config={effectiveConfig}
            jackpotCombo={jackpotComboRef.current}
            onRevealResult={handleCombinationReveal}
            onNavigateToCell={handleNavigateToCell}
            revealedIndices={revealedCells}
          />
        </div>
      </div>

      {/* Main grid area */}
      <div className="flex-1 relative overflow-hidden">
        <GridCanvas
          ref={gridRef}
          config={effectiveConfig}
          revealedCells={revealedCells}
          onSelectionComplete={handleSelectionComplete}
          onViewportChange={handleViewportChange}
          tally={tally}
          isRevealing={isRevealing}
        />

        {/* Minimap */}
        <div
          className="fixed sm:absolute right-3 z-20"
          style={{
            bottom:
              "max(0.75rem, env(safe-area-inset-bottom, 0px) + 0.5rem)",
          }}
        >
          <Minimap
            config={effectiveConfig}
            viewport={viewport}
            revealedCells={revealedCells}
            onNavigate={handleMinimapNavigate}
          />
        </div>


      </div>

      {/* Jackpot / Give-up banner */}
      {showBanner && jackpotCombination && (
        <JackpotBanner
          config={effectiveConfig}
          tally={tally}
          gaveUp={gaveUp}
          combination={jackpotCombination}
          onClose={handleBannerClose}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
