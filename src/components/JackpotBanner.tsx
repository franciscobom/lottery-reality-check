"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GridConfig, TallyState } from "@/types";
import { LotteryCombination, formatCombination } from "@/lib/combination";
import { playJackpotFanfare, playSadTune } from "@/lib/sounds";

interface JackpotBannerProps {
  config: GridConfig;
  tally: TallyState;
  gaveUp: boolean;
  combination: LotteryCombination;
  onClose: () => void;
  onReset: () => void;
}

/* ── Confetti ─────────────────────────────────────────────── */

const CONFETTI_COLORS = [
  "#fbbf24", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6",
  "#a855f7", "#ec4899", "#ffffff",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  rotVel: number;
  opacity: number;
}

function createParticles(cw: number, ch: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 300; i++) {
    particles.push({
      x: cw / 2 + (Math.random() - 0.5) * cw * 0.5,
      y: ch * 0.25 + (Math.random() - 0.5) * ch * 0.2,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -12 - 2,
      w: Math.random() * 10 + 4,
      h: Math.random() * 6 + 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotVel: (Math.random() - 0.5) * 0.3,
      opacity: 1,
    });
  }
  return particles;
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particlesRef.current = createParticles(canvas.width, canvas.height);

    let lastTime = performance.now();

    function animate(now: number) {
      const dt = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;
      if (!canvas || !c) return;
      c.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particlesRef.current) {
        if (p.opacity <= 0) continue;
        alive = true;
        p.x += p.vx * dt;
        p.vy += 0.18 * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotVel * dt;
        p.opacity -= 0.004 * dt;
        if (p.opacity < 0) p.opacity = 0;

        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rotation);
        c.globalAlpha = p.opacity;
        c.fillStyle = p.color;
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
      }

      if (alive) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
    />
  );
}

/* ── Banner ───────────────────────────────────────────────── */

export default function JackpotBanner({
  config,
  tally,
  gaveUp,
  combination,
  onClose,
  onReset,
}: JackpotBannerProps) {
  const soundPlayed = useRef(false);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    const text = gaveUp
      ? `I gave up on Face the Odds after ${tally.revealed.toLocaleString()} tickets. Can you do better?`
      : `I found the jackpot in Face the Odds! Spent ${config.currency} ${tally.spent.toLocaleString("en-US", { minimumFractionDigits: 2 })}. Try to beat that.`;

    if (typeof navigator.share === "function") {
      navigator.share({ title: "Face the Odds", text, url }).catch(() => {});
    } else {
      const doSet = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(doSet).catch(() => {});
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        doSet();
      }
    }
  }, [gaveUp, tally, config]);

  useEffect(() => {
    if (soundPlayed.current) return;
    soundPlayed.current = true;
    if (gaveUp) {
      playSadTune();
    } else {
      playJackpotFanfare();
    }
  }, [gaveUp]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      {!gaveUp && <ConfettiCanvas />}

      <div
        className="relative z-20 max-w-lg w-full mx-4 p-6 sm:p-8 rounded-2xl text-center max-h-[90vh] overflow-y-auto"
        style={
          gaveUp
            ? {
                backgroundColor: "rgb(30 20 20)",
                border: "1px solid rgb(100 50 50)",
              }
            : {
                backgroundColor: "rgb(12 10 20)",
                border: "3px solid rgb(251 191 36)",
                boxShadow:
                  "0 0 40px rgba(251,191,36,0.45), 0 0 100px rgba(251,191,36,0.18)",
              }
        }
      >
        {gaveUp ? (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono mb-2 text-slate-400">
              Giving up? <span className="text-red-400">Good call.</span>
            </h2>
            <p className="text-slate-500 font-mono text-sm mb-4">
              Hopefully you quit real-life lottery tickets this easily too.
              The winning combination was:
            </p>
          </>
        ) : (
          <>
            <h2 className="text-3xl sm:text-5xl font-bold font-mono mb-3 text-amber-400 animate-pulse">
              CONGRATULATIONS!
            </h2>
            <p className="text-amber-300/80 font-mono text-sm mb-4">
              Did you get lucky, did you mastermind your way here,
              or did you just peek at the seed in DevTools?{" "}
              Either way — well done, you absolute maniac.
            </p>
            <p className="text-orange-400 font-mono text-lg sm:text-2xl font-bold mb-4">
              Don&apos;t forget to pay your taxes! 💸
            </p>
          </>
        )}

        {/* Winning combination */}
        <div
          className={`font-mono text-base sm:text-lg mb-4 px-4 py-3 rounded-xl ${
            gaveUp
              ? "bg-slate-800/50 text-slate-400"
              : "bg-amber-900/30 text-amber-300"
          }`}
        >
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">
            Winning combination
          </div>
          {formatCombination(combination)}
        </div>

        {/* Prize */}
        <div
          className={`font-mono text-xl sm:text-2xl font-bold mb-4 ${
            gaveUp ? "text-slate-500 line-through" : "text-green-400"
          }`}
        >
          {config.currency} {config.tiers[0]?.prize.toLocaleString("en-US")}
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-4 sm:gap-6 mb-6 font-mono text-xs text-slate-500 flex-wrap">
          <span>Tickets: {tally.revealed.toLocaleString()}</span>
          <span>
            Spent: {config.currency}{" "}
            {tally.spent.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
          {tally.nearMisses > 0 && (
            <span className="text-purple-400">
              Near misses: {tally.nearMisses}
            </span>
          )}
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-600 transition-colors"
          >
            Back to Board
          </button>
          <button
            onClick={handleShare}
            className="px-5 py-2 bg-slate-700 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-600 transition-colors"
          >
            {copied ? "Copied!" : "Share"}
          </button>
          <button
            onClick={onReset}
            className="px-5 py-2 bg-red-800 text-red-100 rounded-lg font-mono text-sm font-bold hover:bg-red-700 transition-colors"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}
