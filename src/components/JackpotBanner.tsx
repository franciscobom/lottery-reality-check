"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GridConfig, TallyState, Winner } from "@/types";
import { LotteryCombination, formatCombination } from "@/lib/combination";
import { playJackpotFanfare, playSadTune } from "@/lib/sounds";

interface JackpotBannerProps {
  config: GridConfig;
  tally: TallyState;
  gaveUp: boolean;
  combination: LotteryCombination;
  token: string;
  lotteryType: string;
  onClose: () => void;
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
  token,
  lotteryType,
  onClose,
}: JackpotBannerProps) {
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const soundPlayed = useRef(false);

  // Play sound on mount
  useEffect(() => {
    if (soundPlayed.current) return;
    soundPlayed.current = true;
    if (gaveUp) {
      playSadTune();
    } else {
      playJackpotFanfare();
    }
  }, [gaveUp]);

  // Fetch winners
  useEffect(() => {
    fetch(`/api/winners?lotteryType=${encodeURIComponent(lotteryType)}`)
      .then((r) => r.json())
      .then((d) => setWinners(d.winners || []))
      .catch(() => {});
  }, [lotteryType]);

  const handleRegister = useCallback(async () => {
    if (!name.trim()) return;
    setRegError(null);
    setRegistering(true);
    try {
      const res = await fetch("/api/winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          ticketsRevealed: tally.revealed,
          amountSpent: tally.spent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || "Failed to register");
        return;
      }
      setRegistered(true);
      // Refresh winners list
      const wr = await fetch(
        `/api/winners?lotteryType=${encodeURIComponent(lotteryType)}`
      );
      const wd = await wr.json();
      setWinners(wd.winners || []);
    } catch {
      setRegError("Network error");
    } finally {
      setRegistering(false);
    }
  }, [name, token, tally, lotteryType]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      {!gaveUp && <ConfettiCanvas />}

      <div
        className="relative z-20 max-w-lg w-full mx-4 p-6 sm:p-8 rounded-2xl border text-center max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: gaveUp ? "rgb(30 20 20)" : "rgb(20 20 30)",
          borderColor: gaveUp ? "rgb(100 50 50)" : "rgb(180 140 20)",
        }}
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
            <h2 className="text-3xl sm:text-4xl font-bold font-mono mb-2 text-amber-400 animate-pulse">
              CONGRATULATIONS!
            </h2>
            <p className="text-amber-300/80 font-mono text-sm mb-4">
              Did you get lucky, or did you mastermind your way here?
              Either way — well done, you absolute maniac.
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

        {/* Name registration (only for legit wins) */}
        {!gaveUp && !registered && (
          <div className="mb-6">
            <p className="text-amber-300/60 font-mono text-xs mb-2">
              Etch your name in history:
            </p>
            <div className="flex gap-2 justify-center">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setRegError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="Your name"
                maxLength={30}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-600 w-48"
              />
              <button
                onClick={handleRegister}
                disabled={registering || !name.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-mono text-sm font-bold hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {registering ? "..." : "Register"}
              </button>
            </div>
            {regError && (
              <p className="text-red-400 font-mono text-xs mt-1">{regError}</p>
            )}
          </div>
        )}

        {!gaveUp && registered && (
          <p className="text-green-400 font-mono text-sm mb-6">
            Added to the winners board!
          </p>
        )}

        {/* Winners board */}
        {winners.length > 0 && (
          <div className="mb-6">
            <h3 className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-2">
              Winners Board
            </h3>
            <div className="max-h-32 overflow-y-auto">
              {winners.slice(0, 10).map((w, i) => (
                <div
                  key={i}
                  className="flex justify-between font-mono text-xs text-slate-500 py-0.5"
                >
                  <span className="text-slate-300">{w.name}</span>
                  <span>{w.ticketsRevealed.toLocaleString()} tickets</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="px-6 py-2 bg-slate-700 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-600 transition-colors"
        >
          {gaveUp ? "Back to Reality" : "Continue Playing"}
        </button>
      </div>
    </div>
  );
}
