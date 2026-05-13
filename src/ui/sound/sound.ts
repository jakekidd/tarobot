// Web Audio API procedural sound. No audio assets.
// AudioContext must be created from a user gesture; init() should be called
// once from a click handler before any other function here.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastBlipAt = 0;
const MIN_BLIP_INTERVAL_MS = 50;

export function init(): void {
  if (ctx) {
    // If already created but suspended (tab switched, etc.), try to resume.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
}

/**
 * Resume the AudioContext if it's been auto-suspended by the browser
 * (tab backgrounded, etc.). Safe to call from any event handler.
 */
function ensureRunning(): void {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function setVolume(v: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

export function isReady(): boolean {
  return ctx !== null;
}

/**
 * Animal-Crossing-style typewriter blip.
 * Pitch is hashed from charCode + clamped to a sinister low band.
 * Skipped on whitespace and punctuation, rate-limited per call site.
 */
export function blip(charCode: number): void {
  ensureRunning();
  if (!ctx || !master) return;
  if (isWhitespaceOrPunct(charCode)) return;
  const now = performance.now();
  if (now - lastBlipAt < MIN_BLIP_INTERVAL_MS) return;
  lastBlipAt = now;

  // Hash to ±15% pitch jitter around 95 Hz base.
  const hash = ((charCode * 2654435761) >>> 0) / 0xffffffff;
  const base = 95;
  const freq = base * (0.85 + hash * 0.3);

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

  osc.connect(env);
  env.connect(master);
  osc.start(t);
  osc.stop(t + 0.08);
}

/**
 * A small chime for phase transitions. Two-note major third.
 */
export function chime(): void {
  ensureRunning();
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  for (const [freq, offset] of [[440, 0], [554.37, 0.08]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t + offset);
    env.gain.linearRampToValueAtTime(0.7, t + offset + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.6);
    osc.connect(env);
    env.connect(master);
    osc.start(t + offset);
    osc.stop(t + offset + 0.7);
  }
}

/**
 * Card flip whoosh: filtered noise sweep.
 */
export function flip(): void {
  ensureRunning();
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.25);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.6, t + 0.04);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

  src.connect(filter);
  filter.connect(env);
  env.connect(master);
  src.start(t);
  src.stop(t + 0.3);
}

function isWhitespaceOrPunct(code: number): boolean {
  if (code === 32 || code === 9 || code === 10 || code === 13) return true;
  // Common punctuation
  return [33, 34, 39, 44, 46, 58, 59, 63, 8217, 8220, 8221, 8211, 8212].includes(code);
}
