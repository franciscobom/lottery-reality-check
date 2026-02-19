"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  GridConfig,
  ViewportState,
  RevealedCell,
  RevealResult,
  TallyState,
  SessionResponse,
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
import { gridToCombo, gridToComboBatch, comboToGrid } from "@/lib/grid-shuffle";
import { checkCellsBrowser, deriveJackpotIndexBrowser } from "@/lib/client-prize-engine";

const GIVE_UP_THRESHOLD = 100_000;

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
  const [token, setToken] = useState<string | null>(null);
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);

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

  // Show banner when jackpot is found
  useEffect(() => {
    if (jackpotFound && jackpotCombination) {
      setShowBanner(true);
    }
  }, [jackpotFound, jackpotCombination]);

  // Create session on mount and when lottery type changes
  const createSession = useCallback(async (type: string) => {
    setIsLoading(true);
    setError(null);
    revealTimeoutsRef.current.forEach(clearTimeout);
    revealTimeoutsRef.current = [];

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotteryType: type }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create session");
      }

      const data: SessionResponse = await res.json();

      // Derive jackpot combination client-side from seed
      const jackpotIdx = deriveJackpotIndexBrowser(
        data.seed,
        data.config.totalCombinations
      );
      jackpotComboRef.current = indexToCombination(
        jackpotIdx,
        data.config.mainPool,
        data.config.mainPick,
        data.config.bonusPool,
        data.config.bonusPick
      );

      setToken(data.token);
      setSeed(data.seed);
      setConfig(data.config);
      setRevealedCells(new Map());
      setTally({ spent: 0, won: 0, revealed: 0, nearMisses: 0 });
      setIsRevealing(false);
      setJackpotFound(false);
      setGaveUp(false);
      setJackpotCombination(null);
      setShowBanner(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    createSession(lotteryType);
  }, [lotteryType, createSession]);

  const handleLotteryChange = useCallback((id: string) => {
    setLotteryType(id);
  }, []);

  // Handle selection complete → batch reveal (client-side)
  const handleSelectionComplete = useCallback(
    async (indices: number[]) => {
      if (!jackpotComboRef.current || !config || isRevealing) return;

      setIsRevealing(true);

      try {
        // Convert grid indices → combo indices
        const comboIndices = gridToComboBatch(
          indices,
          config.totalCombinations,
          config.shuffleA,
          config.shuffleB
        );

        // Compute prizes client-side via true match-based rules
        const rawResults = checkCellsBrowser(
          jackpotComboRef.current!,
          comboIndices,
          config.tiers,
          config.mainPool,
          config.mainPick,
          config.bonusPool,
          config.bonusPick
        );

        // Map results back to grid indices (nearMiss comes from checkCellsBrowser)
        const results: RevealResult[] = rawResults.map((r, i) => ({
          index: indices[i],
          tierIndex: r.tierIndex,
          prize: r.prize,
          nearMiss: r.nearMiss,
        }));

        const shuffled = fisherYatesShuffle(results);

        // Scale total duration: instant for 1 cell, fast for <10, sqrt curve for rest
        const count = shuffled.length;
        const totalMs = count <= 1 ? 0 : count < 10 ? count * 120 : Math.min(30000, 500 * Math.sqrt(count));
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
            // Sound: loss is the base tick, win only if wins outnumber losses
            let lossCount = 0;
            let winCount = 0;
            let hasNearMiss = false;
            let hasJackpot = false;
            for (const r of batch) {
              if (r.nearMiss) hasNearMiss = true;
              else if (r.tierIndex === 0) hasJackpot = true;
              else if (r.tierIndex > 0) winCount++;
              else lossCount++;
            }
            // Base tick: loss unless wins genuinely dominate
            if (winCount > lossCount) playRevealTick(1);
            else if (lossCount > 0 || winCount > 0) playRevealTick(-1);
            // Rare events always get their sound
            if (hasJackpot) playRevealTick(0);
            else if (hasNearMiss) playNearMissPing();

            // Notify canvas for animation (or instant settle for large batches)
            gridRef.current?.revealCells(
              batch.map((r) => r.index),
              animateFlip
            );

            // Batch state update — single Map copy per tick
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
                addSpent += config.costPerPlay;
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
                  config.totalCombinations,
                  config.shuffleA,
                  config.shuffleB
                );
                const combo = indexToCombination(
                  comboIdx,
                  config.mainPool,
                  config.mainPick,
                  config.bonusPool,
                  config.bonusPick
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
    [config, isRevealing]
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

      if (config) {
        setTally((prev) => ({
          spent: prev.spent + config.costPerPlay,
          won: prev.won + result.prize,
          revealed: prev.revealed + 1,
          nearMisses: prev.nearMisses + (result.nearMiss ? 1 : 0),
        }));
      }

      // Jackpot detection from combination input
      if (result.tierIndex === 0) {
        const comboIdx = gridToCombo(
          index,
          config!.totalCombinations,
          config!.shuffleA,
          config!.shuffleB
        );
        const combo = indexToCombination(
          comboIdx,
          config!.mainPool,
          config!.mainPick,
          config!.bonusPool,
          config!.bonusPick
        );
        setJackpotCombination(combo);
        setJackpotFound(true);
      }
    },
    [config]
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

  const handleReset = useCallback(() => {
    createSession(lotteryType);
  }, [lotteryType, createSession]);

  // Progress toward give-up threshold
  const giveUpProgress = Math.min(tally.revealed / GIVE_UP_THRESHOLD, 1);
  const giveUpReady = tally.revealed >= GIVE_UP_THRESHOLD;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-slate-400 font-mono text-lg animate-pulse">
          Generating 139,838,160 lottery tickets...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-4">
        <div className="text-red-400 font-mono text-lg">{error}</div>
        <button
          onClick={() => createSession(lotteryType)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-mono hover:bg-blue-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!config || seed === null || !jackpotComboRef.current || !token) return null;

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm z-20">
        <div className="flex items-center gap-2 sm:gap-4">
          <h1 className="text-sm sm:text-lg font-bold text-slate-100 font-mono">
            Lottery Reality Check
          </h1>
          <LotterySelector
            currentLottery={lotteryType}
            onSelect={handleLotteryChange}
          />
        </div>

        <div className="text-slate-500 font-mono text-xs hidden sm:block">
          {config.totalCombinations.toLocaleString()} possible tickets &middot;{" "}
          {config.currency} {config.costPerPlay.toFixed(2)} each
        </div>
      </header>

      {/* Tally bar + Combination input */}
      <div className="px-2 sm:px-4 py-2 z-10 flex gap-2 sm:gap-4 items-stretch flex-wrap">
        <div className="flex-1 min-w-[240px] sm:min-w-[300px]">
          <Tally
            tally={tally}
            config={config}
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
            ref={comboInputRef}
            config={config}
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
          config={config}
          revealedCells={revealedCells}
          onSelectionComplete={handleSelectionComplete}
          onViewportChange={handleViewportChange}
          tally={tally}
          isRevealing={isRevealing}
        />

        {/* Minimap — fixed on mobile (breaks out of overflow-hidden), absolute on desktop */}
        <div
          className="fixed sm:absolute right-3 z-20"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <Minimap
            config={config}
            viewport={viewport}
            revealedCells={revealedCells}
            onNavigate={handleMinimapNavigate}
          />
        </div>

        {/* Intro overlay */}
        {showIntro && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/80 backdrop-blur-sm">
            <div className="max-w-lg mx-4 p-8 bg-slate-900 rounded-2xl border border-slate-700 text-center">
              <h2 className="text-2xl font-bold text-slate-100 font-mono mb-4">
                Can you find the winning ticket?
              </h2>
              <p className="text-slate-400 font-mono text-sm mb-3">
                You&apos;re looking at a grid of{" "}
                <span className="text-slate-200 font-bold">
                  {config.totalCombinations.toLocaleString()}
                </span>{" "}
                lottery tickets. Every single possible {config.lotteryName}{" "}
                combination.
              </p>
              <p className="text-slate-400 font-mono text-sm mb-3">
                Exactly <span className="text-amber-400 font-bold">one</span>{" "}
                of them is the jackpot. The rest? Mostly worthless.
              </p>
              <p className="text-slate-400 font-mono text-sm mb-6">
                <span className="text-slate-200">Shift+Drag</span> (or toggle
                selection mode) to reveal tickets, or type in your lucky numbers.
                Watch your money disappear.
              </p>
              <button
                onClick={() => {
                  initAudio();
                  setShowIntro(false);
                }}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-mono font-bold hover:bg-blue-500 transition-colors"
              >
                Start Wasting Money
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Jackpot / Give-up banner */}
      {showBanner && jackpotCombination && (
        <JackpotBanner
          config={config}
          tally={tally}
          gaveUp={gaveUp}
          combination={jackpotCombination}
          token={token}
          lotteryType={lotteryType}
          onClose={handleBannerClose}
        />
      )}
    </div>
  );
}
