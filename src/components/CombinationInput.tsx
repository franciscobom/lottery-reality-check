"use client";

import {
  useState,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { GridConfig, RevealResult } from "@/types";
import { LotteryCombination, combinationToIndex } from "@/lib/combination";
import { comboToGrid } from "@/lib/grid-shuffle";
import { checkCellsBrowser, drawMegaMultiplier } from "@/lib/client-prize-engine";

export interface CombinationInputHandle {
  setAndSubmit: (main: number[], stars: number[]) => void;
}

interface CombinationInputProps {
  config: GridConfig;
  jackpotCombo: LotteryCombination | null;
  onRevealResult: (index: number, result: RevealResult) => void;
  onNavigateToCell: (index: number) => void;
  revealedIndices: { has(key: number): boolean };
}

const CombinationInput = forwardRef<
  CombinationInputHandle,
  CombinationInputProps
>(function CombinationInput(
  { config, jackpotCombo, onRevealResult, onNavigateToCell, revealedIndices }: CombinationInputProps,
  ref
) {
  const [mainNumbers, setMainNumbers] = useState<string[]>(
    Array(config.mainPick).fill("")
  );
  const [starNumbers, setStarNumbers] = useState<string[]>(
    Array(config.bonusPick).fill("")
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    tierIndex: number;
    prize: number;
    multiplier?: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mainRefs = useRef<(HTMLInputElement | null)[]>([]);
  const starRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleMainChange = useCallback(
    (i: number, value: string) => {
      const cleaned = value.replace(/\D/g, "").slice(0, 2);
      setMainNumbers((prev) => {
        const next = [...prev];
        next[i] = cleaned;
        return next;
      });
      setErrorMsg(null);
      setLastResult(null);

      if (cleaned.length === 2 && i < config.mainPick - 1) {
        mainRefs.current[i + 1]?.focus();
      } else if (cleaned.length === 2 && i === config.mainPick - 1) {
        starRefs.current[0]?.focus();
      }
    },
    [config.mainPick]
  );

  const handleStarChange = useCallback(
    (i: number, value: string) => {
      const cleaned = value.replace(/\D/g, "").slice(0, 2);
      setStarNumbers((prev) => {
        const next = [...prev];
        next[i] = cleaned;
        return next;
      });
      setErrorMsg(null);
      setLastResult(null);

      if (cleaned.length === 2 && i < config.bonusPick - 1) {
        starRefs.current[i + 1]?.focus();
      }
    },
    [config.bonusPick]
  );

  // Core submit logic that takes explicit numbers (avoids stale state)
  const submitNumbers = useCallback(
    (main: number[], stars: number[]) => {
      setErrorMsg(null);
      setLastResult(null);

      for (const n of main) {
        if (n < 1 || n > config.mainPool) {
          setErrorMsg(`Main numbers must be 1-${config.mainPool}`);
          return;
        }
      }
      for (const n of stars) {
        if (n < 1 || n > config.bonusPool) {
          setErrorMsg(`${config.bonusName} must be 1-${config.bonusPool}`);
          return;
        }
      }
      if (new Set(main).size !== main.length) {
        setErrorMsg("No duplicate main numbers");
        return;
      }
      if (new Set(stars).size !== stars.length) {
        setErrorMsg(`No duplicate ${config.bonusName.toLowerCase()}`);
        return;
      }

      const comboIndex = combinationToIndex(
        main,
        stars,
        config.mainPool,
        config.mainPick,
        config.bonusPool,
        config.bonusPick
      );

      if (comboIndex < 0 || comboIndex >= config.totalCombinations) {
        setErrorMsg("Invalid combination");
        return;
      }

      // Convert combo index to grid position (shuffled)
      const index = comboToGrid(
        comboIndex,
        config.totalCombinations,
        config.shuffleA,
        config.shuffleB
      );

      if (revealedIndices.has(index)) {
        setErrorMsg("Already revealed! Navigating...");
        onNavigateToCell(index);
        return;
      }

      if (!jackpotCombo) {
        setErrorMsg("Session not ready");
        return;
      }

      setIsSubmitting(true);

      try {
        const results = checkCellsBrowser(
          jackpotCombo,
          [comboIndex],
          config.tiers,
          config.mainPool,
          config.mainPick,
          config.bonusPool,
          config.bonusPick
        );

        const raw = results[0];

        // Apply Mega Millions Megaplier to non-jackpot wins
        let finalPrize = raw.prize;
        let appliedMultiplier: number | undefined;
        if (config.perTicketMultiplier && raw.tierIndex > 0 && raw.prize > 0) {
          appliedMultiplier = drawMegaMultiplier();
          finalPrize = Math.round(raw.prize * appliedMultiplier);
        }

        const result: RevealResult = {
          index,
          tierIndex: raw.tierIndex,
          prize: finalPrize,
          nearMiss: raw.nearMiss,
        };

        setLastResult({
          tierIndex: result.tierIndex,
          prize: result.prize,
          multiplier: appliedMultiplier,
        });
        onRevealResult(index, result);
        setTimeout(() => onNavigateToCell(index), 100);
      } catch {
        setErrorMsg("Computation error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [config, jackpotCombo, revealedIndices, onRevealResult, onNavigateToCell]
  );

  const handleSubmit = useCallback(() => {
    const main = mainNumbers.map((s) => parseInt(s, 10));
    const stars = starNumbers.map((s) => parseInt(s, 10));

    if (main.some(isNaN) || stars.some(isNaN)) {
      setErrorMsg("Fill in all numbers");
      return;
    }

    submitNumbers(main, stars);
  }, [mainNumbers, starNumbers, submitNumbers]);

  // Imperative handle for programmatic submission (Give Up feature)
  useImperativeHandle(ref, () => ({
    setAndSubmit: (main: number[], stars: number[]) => {
      setMainNumbers(main.map((n) => String(n).padStart(2, "0")));
      setStarNumbers(stars.map((n) => String(n).padStart(2, "0")));
      setErrorMsg(null);
      setLastResult(null);
      submitNumbers(main, stars);
    },
  }));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleRandomize = useCallback(() => {
    const mains: number[] = [];
    while (mains.length < config.mainPick) {
      const n = Math.floor(Math.random() * config.mainPool) + 1;
      if (!mains.includes(n)) mains.push(n);
    }
    mains.sort((a, b) => a - b);

    const bonuses: number[] = [];
    while (bonuses.length < config.bonusPick) {
      const n = Math.floor(Math.random() * config.bonusPool) + 1;
      if (!bonuses.includes(n)) bonuses.push(n);
    }
    bonuses.sort((a, b) => a - b);

    setMainNumbers(mains.map((n) => String(n).padStart(2, "0")));
    setStarNumbers(bonuses.map((n) => String(n).padStart(2, "0")));
    setErrorMsg(null);
    setLastResult(null);
  }, [config]);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-1.5 flex-wrap"
        onKeyDown={handleKeyDown}
      >
        {mainNumbers.map((val, i) => (
          <input
            key={`m${i}`}
            ref={(el) => {
              mainRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            value={val}
            onChange={(e) => handleMainChange(i, e.target.value)}
            placeholder={String(i + 1).padStart(2, "0")}
            className="w-8 h-8 sm:w-9 sm:h-9 text-center bg-slate-800 border border-slate-600 rounded-full font-mono text-xs sm:text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-600"
          />
        ))}

        <span className="text-slate-500 font-mono text-xs px-1">+</span>

        {starNumbers.map((val, i) => (
          <input
            key={`s${i}`}
            ref={(el) => {
              starRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            value={val}
            onChange={(e) => handleStarChange(i, e.target.value)}
            placeholder={"\u272A"}
            className="w-8 h-8 sm:w-9 sm:h-9 text-center bg-amber-950/50 border border-amber-700/50 rounded-full font-mono text-xs sm:text-sm text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent placeholder:text-amber-800"
          />
        ))}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-2.5 sm:px-3 h-8 sm:h-9 bg-blue-600 text-white rounded-lg font-mono text-xs font-bold hover:bg-blue-500 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {isSubmitting ? "..." : "Try"}
        </button>

        <button
          onClick={handleRandomize}
          className="px-2 h-8 sm:h-9 bg-slate-700 text-slate-300 rounded-lg font-mono text-xs hover:bg-slate-600 transition-colors"
          title="Random combination"
        >
          Rand
        </button>
      </div>

      {errorMsg && (
        <p className="text-amber-400 font-mono text-xs">{errorMsg}</p>
      )}
      {lastResult && (
        <div className="font-mono text-xs">
          {lastResult.tierIndex === 0 ? (
            <span className="text-amber-400 font-bold animate-pulse">
              JACKPOT! {config.currency}{" "}
              {lastResult.prize.toLocaleString("en-US")}!
            </span>
          ) : lastResult.tierIndex > 0 ? (
            <span className="text-green-400">
              Winner! {config.tiers[lastResult.tierIndex]?.name} &mdash;{" "}
              {config.currency} {lastResult.prize.toLocaleString("en-US")}
              {lastResult.multiplier !== undefined &&
                ` (${lastResult.multiplier}\u00d7 multiplier)`}
            </span>
          ) : (
            <span className="text-red-400">
              No prize. Like almost every ticket.
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default CombinationInput;
