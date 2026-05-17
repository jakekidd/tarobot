// Web Audio API procedural sound. No audio assets.
//
// AudioContext requires a user gesture to BOTH create and resume — and
// browsers (especially Safari) silently refuse resume() from non-gesture
// call stacks (setTimeout typewriter ticks, useEffect mounts).
//
// THREE bad states a context can be in:
//   - null         : never created. blip/chime/flip silently no-op.
//   - 'suspended'  : created but paused. resume() works ONLY from a real
//                    user-gesture stack. Otherwise it returns a promise
//                    that never settles successfully.
//   - 'closed'     : context is dead and cannot be resumed. Has to be
//                    recreated from scratch. Safari does this after long
//                    inactivity, an OS sleep, or sometimes when the tab
//                    has been backgrounded long enough.
//
// Strategy:
//   1. attachGestureGuard() at app boot. Listens (capture-phase) to a
//      grab-bag of gesture types on window + visibilitychange. On every
//      event, ensures ctx is created+running. This is the only path that
//      actually wakes a sleeping ctx.
//   2. init() handles the 'closed' state by nulling out ctx so the next
//      gesture creates a fresh one.
//   3. blip/chime/flip skip playback when state !== 'running'. Scheduling
//      oscillators on a suspended ctx wastes allocations and gives a
//      false sense of "playing"; better to silently drop until the next
//      gesture wakes things back up.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastBlipAt = 0;
const MIN_BLIP_INTERVAL_MS = 50;

function makeCtx(): AudioContext | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  const c = new Ctor();
  ctx = c;
  const g = c.createGain();
  g.gain.value = 0.18;
  g.connect(c.destination);
  master = g;
  return c;
}

export function init(): void {
  if (ctx) {
    if (ctx.state === 'closed') {
      // Dead context — null out and fall through to recreate. Don't
      // dispose master separately; it goes with the ctx.
      ctx = null;
      master = null;
    } else {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
  }
  makeCtx();
}

let gestureGuardAttached = false;

/**
 * Wire sound bootstrap to user gestures. Idempotent. Call once at app
 * boot. Listens (capture phase) to a broad set of gesture types so that
 * ANY interaction anywhere in the page wakes the audio context if it
 * has been suspended or closed.
 */
export function attachGestureGuard(): void {
  if (gestureGuardAttached) return;
  gestureGuardAttached = true;

  const wake = () => {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };

  // Pointer + touch + key + mouse — every browser fires at least one of
  // these for a real user interaction. Capture phase so they fire BEFORE
  // any inner handler can stop propagation.
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  window.addEventListener('pointerdown', wake, opts);
  window.addEventListener('pointerup',   wake, opts);
  window.addEventListener('mousedown',   wake, opts);
  window.addEventListener('touchstart',  wake, opts);
  window.addEventListener('click',       wake, opts);
  // keydown needs non-passive because some sites preventDefault on it;
  // we don't, but using passive: false would block scrolling on Space.
  // Pass through cleanly.
  window.addEventListener('keydown',     wake, { capture: true });

  // When the tab becomes visible again, attempt a resume. This won't
  // succeed in Safari if it's not in a gesture stack, but in Chrome it
  // often does and at least re-creates ctx if it was closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });

  // Console diagnostic for the SFX cutout. From the devtools console:
  //   __sfx.state()  → 'null' | 'running' | 'suspended' | 'closed'
  //   __sfx.wake()   → force a wake from the (gesture) console call
  //   __sfx.chime()  → smoke-test a sound
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__sfx = {
    state: audioState,
    wake,
    chime,
  };
}

export function setVolume(v: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

export function isReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}

/** Diagnostic — current ctx state, for debugging the SFX cutout. */
export function audioState(): string {
  return ctx ? ctx.state : 'null';
}

/** Internal guard: skip playback unless ctx is in 'running' state. */
function ready(): { c: AudioContext; m: GainNode } | null {
  if (!ctx || !master) return null;
  if (ctx.state !== 'running') {
    // Try one more resume in case the call stack happens to be a gesture
    // (e.g. blip called from a click handler). If not, this is a no-op.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return null;
  }
  return { c: ctx, m: master };
}

/**
 * Animal-Crossing-style typewriter blip.
 * Pitch is hashed from charCode + clamped to a sinister low band.
 * Skipped on whitespace and punctuation, rate-limited per call site.
 */
export function blip(charCode: number): void {
  if (isWhitespaceOrPunct(charCode)) return;
  const now = performance.now();
  if (now - lastBlipAt < MIN_BLIP_INTERVAL_MS) return;
  const r = ready();
  if (!r) return;
  lastBlipAt = now;

  // Hash to ±15% pitch jitter around 95 Hz base.
  const hash = ((charCode * 2654435761) >>> 0) / 0xffffffff;
  const base = 95;
  const freq = base * (0.85 + hash * 0.3);

  const t = r.c.currentTime;
  const osc = r.c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);

  const env = r.c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

  osc.connect(env);
  env.connect(r.m);
  osc.start(t);
  osc.stop(t + 0.08);
}

/**
 * A small chime for phase transitions. Two-note major third.
 */
export function chime(): void {
  const r = ready();
  if (!r) return;
  const t = r.c.currentTime;
  for (const [freq, offset] of [[440, 0], [554.37, 0.08]] as const) {
    const osc = r.c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = r.c.createGain();
    env.gain.setValueAtTime(0, t + offset);
    env.gain.linearRampToValueAtTime(0.7, t + offset + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.6);
    osc.connect(env);
    env.connect(r.m);
    osc.start(t + offset);
    osc.stop(t + offset + 0.7);
  }
}

/**
 * Card flip whoosh: filtered noise sweep.
 */
export function flip(): void {
  const r = ready();
  if (!r) return;
  const t = r.c.currentTime;
  const buffer = r.c.createBuffer(1, r.c.sampleRate * 0.3, r.c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;

  const src = r.c.createBufferSource();
  src.buffer = buffer;

  const filter = r.c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.25);

  const env = r.c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.6, t + 0.04);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

  src.connect(filter);
  filter.connect(env);
  env.connect(r.m);
  src.start(t);
  src.stop(t + 0.3);
}

function isWhitespaceOrPunct(code: number): boolean {
  if (code === 32 || code === 9 || code === 10 || code === 13) return true;
  // Common punctuation
  return [33, 34, 39, 44, 46, 58, 59, 63, 8217, 8220, 8221, 8211, 8212].includes(code);
}
