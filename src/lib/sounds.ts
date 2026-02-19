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
    // Win — subtle pleasant ding (quieter so batch reveals stay balanced)
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.02, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t);
    osc.stop(t + 0.1);
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
 * Multi-note ascending major arpeggio with sustained chord.
 */
export function playJackpotFanfare() {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  const notes = [523, 659, 784, 1047]; // C5 - E5 - G5 - C6
  const noteLen = 0.2;
  const gap = 0.15;

  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = "sine";
    const start = t + i * (noteLen + gap);
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.15, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.3);
    osc.start(start);
    osc.stop(start + noteLen + 0.3);
  });

  // Sustained major chord
  const chordStart = t + notes.length * (noteLen + gap);
  [523, 659, 784, 1047].forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, chordStart);
    g.gain.setValueAtTime(0.1, chordStart);
    g.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.5);
    osc.start(chordStart);
    osc.stop(chordStart + 1.5);
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
