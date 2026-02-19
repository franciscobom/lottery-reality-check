/**
 * Web Audio sound effects for cell reveals.
 * Procedurally generated — no audio files.
 */

let ctx: AudioContext | null = null;
let lastTickTime = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

/** Call on first user interaction to unlock AudioContext on mobile. */
export function initAudio() {
  const c = getCtx();
  if (c?.state === "suspended") c.resume();
}

/**
 * Play a sound for a single cell reveal.
 * Loss: punchy low thud with square wave (throttled to ~40/sec).
 * Win: subtle pleasant ding (quiet so it doesn't overpower in batches).
 * Jackpot: ascending bright tone.
 */
export function playRevealTick(tierIndex: number) {
  const now = performance.now();

  // Throttle loss ticks to ~40/sec; wins/jackpots always play
  if (tierIndex < 0 && now - lastTickTime < 25) return;
  lastTickTime = now;

  const audioCtx = getCtx();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (tierIndex === 0) {
    // Jackpot — ascending bright tone
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, t);
    osc.frequency.linearRampToValueAtTime(1047, t + 0.4);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.start(t);
    osc.stop(t + 0.7);
  } else if (tierIndex > 0) {
    // Win — pitch, duration, and gain scale with prize tier.
    // Tier 1 (best win): high bright ding. Tier 12 (lowest win): short low ding.
    const MAX_TIER = 12;
    const normalized = (MAX_TIER - tierIndex) / (MAX_TIER - 1); // 0 = worst, 1 = best
    const freq = 440 + normalized * (1047 - 440);   // 440 Hz → 1047 Hz
    const dur  = 0.08 + normalized * 0.14;           // 80 ms → 220 ms
    const vol  = 0.015 + normalized * 0.04;          // quiet → moderate
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  } else {
    // Loss — punchy low thud with square wave for presence
    osc.type = "square";
    osc.frequency.setValueAtTime(220 + Math.random() * 40, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    gain.gain.setValueAtTime(0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}

/**
 * Play a distinctive alert for near-miss cells (one number off from jackpot).
 * Rising two-tone "almost!" ping.
 */
export function playNearMissPing() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;

  // First note — low
  const osc1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  osc1.connect(g1);
  g1.connect(audioCtx.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(440, t);
  g1.gain.setValueAtTime(0.1, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc1.start(t);
  osc1.stop(t + 0.15);

  // Second note — higher, slight delay
  const osc2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  osc2.connect(g2);
  g2.connect(audioCtx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(660, t + 0.08);
  g2.gain.setValueAtTime(0, t);
  g2.gain.setValueAtTime(0.12, t + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc2.start(t + 0.08);
  osc2.stop(t + 0.3);
}

/**
 * Play a celebratory fanfare for jackpot win.
 * Extended ascending major arpeggio (G4→E6) with a full sustained chord.
 */
export function playJackpotFanfare() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  // G4 - C5 - E5 - G5 - C6 - E6: wider range for a more triumphant feel
  const notes = [392, 523, 659, 784, 1047, 1319];
  const noteLen = 0.18;
  const gap = 0.10;

  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = "sine";
    const start = t + i * (noteLen + gap);
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.22, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.35);
    osc.start(start);
    osc.stop(start + noteLen + 0.35);
  });

  // Full sustained major chord — all six pitches together
  const chordStart = t + notes.length * (noteLen + gap);
  notes.forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, chordStart);
    g.gain.setValueAtTime(0.14, chordStart);
    g.gain.exponentialRampToValueAtTime(0.001, chordStart + 2.2);
    osc.start(chordStart);
    osc.stop(chordStart + 2.2);
  });
}

/**
 * Play a sad descending tune for the give-up reveal.
 */
export function playSadTune() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  const notes = [523, 466, 415, 392]; // C5 - Bb4 - Ab4 - G4
  const noteLen = 0.35;
  const gap = 0.05;

  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = "triangle";
    const start = t + i * (noteLen + gap);
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.08, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.1);
    osc.start(start);
    osc.stop(start + noteLen + 0.1);
  });
}
