// Reading screen — fan-out pipeline interface.
//
// Layout: two columns inside the centered rig.
//   Left  — Transcript (the running chat log, scrolls upward as new lines
//           arrive, copy button at the corner).
//   Right — Eyes anchor (publishes bbox to the unified 3D scene), rigid
//           dialogue box (chunked typewriter — never resizes), TableAnchor
//           (publishes bbox so the perspective camera scissors here), card
//           subtitle below the table, chat input at the bottom.
//
// All 3D — eyes, table, cards — renders in the single full-viewport
// TarobotScene canvas. This component only places DOM anchors and routes
// engine state into the scene's stores.
//
// Phase → render mapping:
//   thinking            → stall over empty stage
//   intro               → chunked typewriter, advances on tap
//   awaiting_flip       → cards clickable via TableAnchor; chat enabled
//   flipping            → card tweens face_down → face_up
//   beat_pending        → card tweens face_up → lifted (stall in stage)
//   beat                → chunked typewriter monologue; subtitle visible
//   chat_pending        → stall in the chat panel
//   closing_thinking    → stall while closing
//   outro               → chunked typewriter outro; advances on tap
//   done                → chat still active; close button surfaced
//   error               → message + close

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnthropicAdapter, type CompilerOutput } from '../pipeline/survey';
import {
  drawForSpread,
  FOUR_CARD_DIAMOND,
  type DrawnCards,
} from '../pipeline';
import { createClaudeClient } from '../pipeline/claude';
import {
  ReadingEngine,
  readingInputsFromCompiler,
  type Monologue,
  type ReadingState,
  pickFiller,
  FILLER_MIN_MS,
  FILLER_MAX_MS,
} from '../pipeline/reading';
import { ReaderAnchor } from './scene/ReaderAnchor';
import { TableAnchor } from './scene/TableAnchor';
import {
  setCardScene,
  type CardStage,
  type SlotName,
} from './scene/cardSceneStore';
import { pickAt } from './scene/pickService';
import { Transcript, type TranscriptItem } from './Transcript';
import { useTypewriter } from './dialogue/useTypewriter';
import { highlightNames, type Highlights } from './dialogue/highlightNames';
import { parseEmphasis, type EmphasisRange } from './dialogue/parseEmphasis';
import { setDizzy } from './scene/dizzyStore';
import { setReaderMode } from './scene/readerModeStore';
import { startFlyIn, endFlyIn, subscribeFlyIn } from './scene/flyInStore';
import { loadSettings } from '../storage';
import { publishDebug, clearDebug } from '../debug/debugBus';
import { blip, chime } from './sound/sound';

type Props = {
  apiKey: string;
  brief: CompilerOutput;
  preferredIntro?: Monologue;
  onExit: () => void;
};

const FLIP_ANIM_MS = 950;
// Soft cap per dialogue chunk (chars). The rigid box holds ~three lines
// of monologue text at the wider width below; sentence-boundary split
// picks the nearest break under this cap.
const CHUNK_MAX_CHARS = 200;

export function Reading({ apiKey, brief, preferredIntro, onExit }: Props) {
  const drawn: DrawnCards = useMemo(
    () => drawForSpread(FOUR_CARD_DIAMOND),
    [],
  );

  const engine = useMemo(() => {
    const client = createClaudeClient(apiKey);
    const adapter = new AnthropicAdapter(client);
    return new ReadingEngine({
      adapter,
      inputs: readingInputsFromCompiler(brief, drawn, {
        ...(preferredIntro ? { preferred_intro: preferredIntro } : {}),
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, drawn]);

  const [state, setStateLocal] = useState<ReadingState>(() => engine.getState());

  // Cinematic intro: camera starts ~120 units back (table reads as a
  // tiny speck — the user's "light at the end of the tunnel"), lerps
  // toward the normal POV over ~3.5s. During fly-in the seer (eyes)
  // is hidden so the ghost only "appears" when we arrive. The engine
  // starts in parallel — its first LLM call takes ~1-3s anyway, so
  // intro lands close to the moment we settle.
  useEffect(() => {
    const unsub = engine.subscribe(setStateLocal);
    startFlyIn();
    const unsubFly = subscribeFlyIn((s) => {
      if (!s.active) {
        // Fly-in landed → ghost appears + engine begins.
        setReaderMode('eyes');
        void engine.start();
      }
    });
    return () => {
      unsub();
      unsubFly();
      endFlyIn();
    };
  }, [engine]);

  // Dizzy while we're awaiting an LLM call (any tier).
  useEffect(() => {
    setDizzy(state.awaiting_tier !== null);
    return () => setDizzy(false);
  }, [state.awaiting_tier]);

  // Restore cat face on unmount (set to 'eyes' in the fly-in handler).
  useEffect(() => {
    return () => setReaderMode('cat');
  }, []);

  // Drive flip-tween → engine handoff once the CSS-3D rotation has played.
  useEffect(() => {
    if (state.phase !== 'flipping') return;
    const t = window.setTimeout(() => engine.advanceFromFlip(), FLIP_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, engine]);

  useEffect(() => () => setDizzy(false), []);

  // SFX: chime on intro arrival and outro arrival.
  const lastChimePhaseRef = useRef<string>('');
  useEffect(() => {
    const p = state.phase;
    if ((p === 'intro' || p === 'outro') && lastChimePhaseRef.current !== p) {
      lastChimePhaseRef.current = p;
      chime();
    } else if (p !== 'intro' && p !== 'outro') {
      lastChimePhaseRef.current = '';
    }
  }, [state.phase]);

  // Publish reading state for the debug overlay.
  useEffect(() => {
    publishDebug('reading.phase', state.phase);
    publishDebug('reading.awaiting', state.awaiting_tier ?? null);
    publishDebug('reading.revealed', `${state.revealed.length}/${drawn.cards.length}`);
    publishDebug('reading.slot', state.current_slot ?? null);
  }, [state.phase, state.awaiting_tier, state.revealed.length, state.current_slot, drawn.cards.length]);
  useEffect(() => () => {
    clearDebug('reading.phase');
    clearDebug('reading.awaiting');
    clearDebug('reading.revealed');
    clearDebug('reading.slot');
  }, []);

  // Per-slot stage map for the perspective layer.
  const stages = useMemo<Partial<Record<SlotName, CardStage>>>(() => {
    const m: Partial<Record<SlotName, CardStage>> = {};
    for (const r of state.revealed) {
      m[r.position_id as SlotName] = 'face_up';
    }
    if (state.current_slot) {
      const slot = state.current_slot as SlotName;
      // Unified flip-and-lift: the card goes face_down → lifted in ONE
      // tween (quaternion slerp arcs through "card upright facing camera"
      // while position lerps from table to in-front-of-face). No
      // intermediate face_up-flat-on-table → no clip through the table.
      if (
        state.phase === 'flipping' ||
        state.phase === 'beat_pending' ||
        state.phase === 'beat'
      ) {
        m[slot] = 'lifted';
      }
    }
    return m;
  }, [state.revealed, state.phase, state.current_slot]);

  const pickable = state.phase === 'awaiting_flip';

  // Push the scene state into the store — TarobotScene's perspective
  // layer reads from there.
  useEffect(() => {
    setCardScene({ drawn, stages, pickable });
  }, [drawn, stages, pickable]);

  // On unmount, clear the scene state so the table/cards hide and the
  // perspective render is skipped.
  useEffect(() => {
    return () => {
      setCardScene({ drawn: null, stages: {}, pickable: false });
    };
  }, []);

  // Card name for the subtitle.
  const activeCardName = useMemo(() => {
    if (!state.current_slot) return null;
    const dc = drawn.cards.find((c) => c.position.id === state.current_slot);
    return dc?.card.name ?? null;
  }, [state.current_slot, drawn]);

  const subtitleVisible =
    state.phase === 'beat_pending' || state.phase === 'beat';

  // Names to highlight in seer dialogue + transcript. The user's name
  // and any drawn card's name read in brand violet.
  const highlights = useMemo<Highlights>(() => ({
    userName: brief.profile?.identity?.name ?? null,
    cardNames: drawn.cards.map((c) => c.card.name),
  }), [brief.profile?.identity?.name, drawn]);

  // Unified transcript: seer's intro + each beat (with card name label) +
  // user/seer chat exchanges + outro (once delivered). The IN-PROGRESS
  // beat (during beat / beat_pending) is also pushed so the transcript
  // updates the moment a beat is being delivered, not after the user
  // taps past it.
  const transcriptItems = useMemo<TranscriptItem[]>(() => {
    const items: TranscriptItem[] = [];
    if (state.intro?.text) {
      items.push({ speaker: 'seer', text: state.intro.text, key: 'intro' });
    }
    for (const r of state.revealed) {
      const card = drawn.cards.find((c) => c.position.id === r.position_id)?.card;
      items.push({
        speaker: 'seer',
        text: r.monologue.text,
        ...(card ? { label: card.name } : {}),
        key: `beat-${r.position_id}`,
      });
    }
    // In-progress beat (not yet in state.revealed)
    if (
      state.current_slot &&
      (state.phase === 'beat' || state.phase === 'beat_pending') &&
      !state.revealed.some((r) => r.position_id === state.current_slot)
    ) {
      const monologue = engine.getCurrentMonologue();
      if (monologue) {
        const card = drawn.cards.find((c) => c.position.id === state.current_slot)?.card;
        items.push({
          speaker: 'seer',
          text: monologue.text,
          ...(card ? { label: card.name } : {}),
          key: `beat-${state.current_slot}-live`,
        });
      }
    }
    state.chat.forEach((m, i) => {
      items.push({ speaker: m.speaker, text: m.text, key: `chat-${i}` });
    });
    if (state.outro?.text && (state.phase === 'outro' || state.phase === 'done')) {
      items.push({ speaker: 'seer', text: state.outro.text, key: 'outro' });
    }
    return items;
  }, [state.intro, state.revealed, state.chat, state.outro, state.phase, state.current_slot, drawn, engine]);

  // Screen-wide click-to-advance. ChunkedLine watches advanceTick and
  // calls its tap() when it bumps. Clicks on interactive zones (input,
  // button, table-anchor, transcript-fullpage) are excluded.
  const [advanceTick, setAdvanceTick] = useState(0);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  function onScreenClick(e: React.MouseEvent<HTMLDivElement>) {
    if (transcriptOpen) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, button, .reading__chat')) return;
    // Card pick takes precedence — raycast through the scene's picker. If
    // it hit a face-down card, register the pick and bail (don't also
    // advance dialogue).
    if (pickable) {
      const slot = pickAt(e.clientX, e.clientY);
      if (slot) {
        engine.pickSlot(slot);
        return;
      }
    }
    // Anywhere else: advance dialogue if we're in an advance-able phase.
    if (state.phase === 'intro' || state.phase === 'beat' || state.phase === 'outro') {
      setAdvanceTick((t) => t + 1);
    }
  }

  return (
    <div className="screen screen--reading" onClick={onScreenClick}>
      <div className="reading__cols">
        {/* Transcript is a shelf — closed by default, opened via the
            TRANSCRIPT button (renders as the fullpage overlay below).
            The right column owns the full viewport when closed. */}
        <section className="reading__col-right">
          {/* TableAnchor fills the entire right column — its bbox IS the
              scene rect. Everything else is an absolute overlay on top.
              Click-to-pick lives in onScreenClick above. */}
          <TableAnchor pickable={pickable} />

          <div className="reading__head">
            <ReaderAnchor size={130} />
          </div>
          <div className="reading__stage-slot">
            <ReadingStage state={state} engine={engine} advanceTick={advanceTick} highlights={highlights} />
          </div>
          {state.phase === 'awaiting_flip' && (
            <div className="reading__pickcue" aria-hidden>
              <em>pick a card.</em>
            </div>
          )}
          <CardSubtitle name={activeCardName} visible={subtitleVisible} />
          <div className="reading__chat-slot">
            <ChatForm state={state} onSend={(text) => void engine.submitChat(text)} />
          </div>
          <CardHint visible={state.phase === 'awaiting_flip' || state.phase === 'done'} />

          <button
            type="button"
            className="reading__transcript-open"
            onClick={() => setTranscriptOpen(true)}
          >
            TRANSCRIPT
          </button>
          <ReadingFooter state={state} onExit={onExit} />
        </section>
      </div>

      {transcriptOpen && (
        <div className="reading__transcript-fullpage" role="dialog">
          <button
            type="button"
            className="reading__transcript-close"
            onClick={() => setTranscriptOpen(false)}
          >
            ← BACK
          </button>
          <div className="reading__transcript-fullpage-body">
            <Transcript
              items={transcriptItems}
              stallShown={state.phase === 'chat_pending'}
              highlights={highlights}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card subtitle (3D-ish floating letters below the lifted card) ──

function CardSubtitle({
  name,
  visible,
}: {
  name: string | null;
  visible: boolean;
}) {
  const display = name ?? '';
  const letters = display.toUpperCase().split('');
  return (
    <div
      className={`card-subtitle ${visible && display ? 'card-subtitle--on' : ''}`}
      aria-live="polite"
    >
      <span className="card-subtitle__inner">
        {letters.map((ch, i) =>
          ch === ' ' ? (
            <span key={i} className="card-subtitle__space">&nbsp;</span>
          ) : (
            <span
              key={i}
              className="card-subtitle__letter"
              style={{ animationDelay: `${(i * 90) % 1400}ms` }}
            >
              {ch}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

/** Hint phrase that sits BELOW the chat input — only visible while
 *  the input is enabled (i.e., the seer is "listening" for a chat
 *  reply). Lives in its own element so it doesn't have to track the
 *  card-subtitle's positioning. */
function CardHint({ visible }: { visible: boolean }) {
  return (
    <div className={`card-hint ${visible ? 'card-hint--on' : ''}`} aria-hidden>
      <em>tell me if i'm wrong.</em>
    </div>
  );
}

// ─── Stage (intro / beat / outro / stall) ────────────────

type StageProps = {
  state: ReadingState;
  engine: ReadingEngine;
  advanceTick: number;
  highlights: Highlights;
};

function ReadingStage({ state, engine, advanceTick, highlights }: StageProps) {
  if (state.phase === 'idle' || state.phase === 'thinking') {
    return <FillerLine tier="persona" />;
  }
  if (state.phase === 'error') {
    return <div className="reading__error">{state.error ?? 'something went wrong.'}</div>;
  }
  if (state.phase === 'intro' && state.intro) {
    return (
      <ChunkedLine
        key="intro"
        kind="intro"
        text={state.intro.text}
        advanceTick={advanceTick}
        highlights={highlights}
        onAdvance={() => engine.advanceFromIntro()}
      />
    );
  }
  if (state.phase === 'awaiting_flip') {
    // While waiting for a card flip, the dialogue area shows the
    // most recent SEER chat reply (if any) so the user can read what
    // the seer just said. The "pick a card." cue is rendered separately,
    // lower on the screen, so it doesn't block the dialogue.
    const lastSeerReply = [...state.chat].reverse().find((m) => m.speaker === 'seer');
    if (lastSeerReply) {
      return (
        <ChunkedLine
          key={`chat-reply-${state.chat.length}`}
          kind="beat"
          text={lastSeerReply.text}
          advanceTick={advanceTick}
          highlights={highlights}
          onAdvance={() => { /* no-op — chat replies don't advance phase */ }}
        />
      );
    }
    // No chat history yet → empty rigid box maintains layout.
    return <div className="reading__beat reading__dialogue-rigid" />;
  }
  if (state.phase === 'flipping' || state.phase === 'beat_pending') {
    return <FillerLine tier={state.awaiting_tier ?? 'persona'} />;
  }
  if (state.phase === 'beat') {
    const monologue = engine.getCurrentMonologue();
    if (!monologue) return <div className="reading__beat" />;
    return (
      <ChunkedLine
        key={`beat-${state.current_slot}-${state.revealed.length}`}
        kind="beat"
        text={monologue.text}
        advanceTick={advanceTick}
        highlights={highlights}
        onAdvance={() => engine.advanceFromBeat()}
      />
    );
  }
  if (state.phase === 'closing_thinking') {
    return <FillerLine tier={state.awaiting_tier ?? 'cognition'} />;
  }
  if (state.phase === 'outro' && state.outro) {
    return (
      <ChunkedLine
        key="outro"
        kind="outro"
        text={state.outro.text}
        advanceTick={advanceTick}
        highlights={highlights}
        onAdvance={() => engine.advanceFromOutro()}
      />
    );
  }
  if (state.phase === 'done' && state.outro) {
    return <div className="reading__outro">{state.outro.text}</div>;
  }
  return null;
}

// ─── Filler line ─────────────────────────────────────────
// Replaces the old spinner+catchphrase. While we're waiting on a
// blocking LLM call, the seer chains short filler phrases ("hmm…",
// "i see…", "patience…") that rotate every ~1.5–3s. Reads as
// thoughtfulness; disguises the latency.

function FillerLine({ tier }: { tier: 'cognition' | 'persona' }) {
  const [text, setText] = useState(() => pickFiller());

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    function schedule() {
      const delay = FILLER_MIN_MS + Math.random() * (FILLER_MAX_MS - FILLER_MIN_MS);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setText((prev) => pickFiller(prev));
        schedule();
      }, delay);
    }
    schedule();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`reading__filler reading__filler--${tier}`} aria-live="polite">
      {text}
    </div>
  );
}

// ─── Chunked typed line ──────────────────────────────────
// Breaks long monologues into chunks that fit a rigid-size dialogue box.
// Click finishes the current typing animation; click on a completed
// chunk advances to the next one (or calls onAdvance on the final chunk).

function ChunkedLine({
  kind,
  text,
  advanceTick,
  highlights,
  onAdvance,
}: {
  kind: 'intro' | 'beat' | 'outro';
  text: string;
  advanceTick: number;
  highlights: Highlights;
  onAdvance: () => void;
}) {
  const chunks = useMemo(() => {
    const parsed = parseEmphasis(text);
    return chunkWithRanges(parsed.text, parsed.ranges, CHUNK_MAX_CHARS);
  }, [text]);

  const [idx, setIdx] = useState(0);
  const [chunkDone, setChunkDone] = useState(false);
  // skip() is exposed by the typewriter through a ref the child writes to.
  const skipRef = useRef<(() => void) | null>(null);

  // No reset-on-text-change effect needed: the parent (ReadingStage) keys
  // each <ChunkedLine> by phase + slot + revealed.length, so a new beat
  // remounts this component entirely.

  const isLast = idx >= chunks.length - 1;

  function tap() {
    if (!chunkDone) skipRef.current?.();
    else if (!isLast) {
      setChunkDone(false);
      setIdx((i) => i + 1);
    } else onAdvance();
  }

  const tapRef = useRef(tap);
  useEffect(() => { tapRef.current = tap; });
  const lastTickRef = useRef(advanceTick);
  useEffect(() => {
    if (advanceTick === lastTickRef.current) return;
    lastTickRef.current = advanceTick;
    tapRef.current();
  }, [advanceTick]);

  const current = chunks[idx] ?? { text: '', ranges: [] };

  return (
    <div
      className={`reading__${kind} reading__dialogue-rigid`}
      onClick={(e) => { e.stopPropagation(); tap(); }}
      role="button"
      tabIndex={0}
    >
      {/* Keyed: each chunk gets a fresh ChunkRenderer + fresh useTypewriter.
          Without the remount, useTypewriter's internal index never resets
          and the next chunk slams in fully-typed. */}
      <ChunkRenderer
        key={`${kind}-${idx}-${chunks.length}`}
        chunk={current}
        highlights={highlights}
        skipRef={skipRef}
        onDone={() => setChunkDone(true)}
      />
      {chunkDone && (
        <span className="reading__dialogue-caret" aria-hidden>
          <svg viewBox="0 0 32 18">
            <path d="M2 2 L30 2 L16 17 Z" />
          </svg>
        </span>
      )}
    </div>
  );
}

/** Renders ONE chunk with its own typewriter instance. Remounted (via
 *  `key` on the call site) whenever the chunk changes, so the typewriter
 *  state truly resets. */
function ChunkRenderer({
  chunk,
  highlights,
  skipRef,
  onDone,
}: {
  chunk: Chunk;
  highlights: Highlights;
  skipRef: React.MutableRefObject<(() => void) | null>;
  onDone: () => void;
}) {
  const settings = useMemo(() => loadSettings(), []);
  const { displayed, done, skip } = useTypewriter(
    chunk.text.toLowerCase(),
    settings.charDelayMs,
    blip,
  );
  // Expose skip + report done to parent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { skipRef.current = skip; }, [skip]);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (done && !reportedRef.current) {
      reportedRef.current = true;
      onDone();
    }
  }, [done, onDone]);

  return (
    <span className="reading__dialogue-text">
      {renderWithEmphasis(chunk.text, displayed, chunk.ranges, highlights)}
      {!done && <span className="reading__cursor-spiral" aria-hidden />}
    </span>
  );
}

type Chunk = { text: string; ranges: EmphasisRange[] };

/** Chunk text into sentence-bounded pieces ≤ maxLen and translate any
 *  emphasis ranges into chunk-local coordinates. */
function chunkWithRanges(text: string, ranges: EmphasisRange[], maxLen: number): Chunk[] {
  if (!text) return [];
  // Tokenize sentences with their absolute start offsets.
  const sentenceRegex = /[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g;
  const sentences: Array<{ text: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRegex.exec(text)) !== null) {
    sentences.push({ text: m[0], start: m.index });
  }
  if (sentences.length === 0) sentences.push({ text, start: 0 });

  type Slice = { text: string; absStart: number };
  const slices: Slice[] = [];
  let buf = '';
  let bufStart = sentences[0]?.start ?? 0;
  for (const s of sentences) {
    if (!buf) {
      buf = s.text;
      bufStart = s.start;
    } else if (buf.length + s.text.length <= maxLen) {
      buf += s.text;
    } else {
      slices.push({ text: buf, absStart: bufStart });
      buf = s.text;
      bufStart = s.start;
    }
  }
  if (buf) slices.push({ text: buf, absStart: bufStart });

  return slices.map(({ text: sliceText, absStart }) => {
    const sliceEnd = absStart + sliceText.length;
    const localRanges = ranges
      .filter((r) => r.start >= absStart && r.end <= sliceEnd)
      .map((r) => ({ start: r.start - absStart, end: r.end - absStart }));
    // Trim leading whitespace, shifting ranges to compensate.
    const leading = sliceText.length - sliceText.trimStart().length;
    const trimmed = sliceText.trim();
    const adjusted = leading
      ? localRanges
          .map((r) => ({ start: r.start - leading, end: r.end - leading }))
          .filter((r) => r.start >= 0 && r.end <= trimmed.length)
      : localRanges;
    return { text: trimmed, ranges: adjusted };
  });
}

/** Lag (in chars typed past the range's end) before the underline animates in. */
const EMPHASIS_LAG = 8;

/** Render the typewriter's `displayed` prefix of `full`. Emphasis spans
 *  are only emitted once the WHOLE phrase has been typed — until then,
 *  the chars in the range render as plain text. (Earlier behavior of
 *  rendering a partial `<span class="hl-em">` would let the inline-block
 *  span wrap unexpectedly, splitting words like "sharpened" → "s\nharpened".)
 *  Once the phrase completes, the underline animates in after a small
 *  `EMPHASIS_LAG` so it reads as "marked up in hindsight". */
function renderWithEmphasis(
  full: string,
  displayed: string,
  ranges: EmphasisRange[],
  highlights: Highlights,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const len = displayed.length;
  let cursor = 0;
  let key = 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (const r of sorted) {
    if (r.start >= len) break;
    // Plain text before this range
    if (cursor < r.start) {
      const seg = full.slice(cursor, Math.min(r.start, len));
      out.push(<React.Fragment key={`p-${key++}`}>{highlightNames(seg, highlights)}</React.Fragment>);
    }
    if (r.end > len) {
      // Phrase NOT fully typed — render the partial chars as plain text.
      // No span yet → no inline-block wrap surprise.
      const partial = full.slice(r.start, len);
      out.push(<React.Fragment key={`pt-${key++}`}>{highlightNames(partial, highlights)}</React.Fragment>);
      cursor = len;
      break;          // displayed has run out
    }
    // Whole phrase typed — render the emphasis span atomically.
    const emText = full.slice(r.start, r.end);
    const underlineOn = len >= r.end + EMPHASIS_LAG;
    out.push(
      <span
        key={`em-${key++}`}
        className={`hl-em${underlineOn ? ' hl-em--on' : ''}`}
      >
        {highlightNames(emText, highlights)}
      </span>,
    );
    cursor = r.end;
  }
  // Tail
  if (cursor < len) {
    const seg = full.slice(cursor, len);
    out.push(<React.Fragment key={`t-${key++}`}>{highlightNames(seg, highlights)}</React.Fragment>);
  }
  return out;
}


// ─── Chat form (no log — log lives in Transcript) ───────

function ChatForm({
  state,
  onSend,
}: {
  state: ReadingState;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = state.phase === 'awaiting_flip' || state.phase === 'done';
  const activePrompt = state.active_prompt_to_user;

  useEffect(() => {
    if (activePrompt && canSend) inputRef.current?.focus();
  }, [activePrompt, canSend]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="reading__chat">
      {activePrompt && canSend && (
        <div className="reading__chat-prompt" aria-live="polite">
          <em>{activePrompt.toLowerCase()}</em>
        </div>
      )}
      <form
        className={`reading__chat-form ${canSend ? 'is-active' : 'is-listening'}`}
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          className="reading__chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          disabled={!canSend}
          placeholder={
            !canSend
              ? 'listening…'
              : activePrompt
                ? '…'
                : 'say something to the seer'
          }
          aria-label="chat with the seer"
        />
        <button
          type="submit"
          className="reading__chat-send"
          disabled={!canSend || draft.trim().length === 0}
          aria-label="send"
        >
          <SendArrow />
        </button>
      </form>
    </div>
  );
}

/** Runic up-arrow (Tiwaz-style) — the SEND glyph. */
function SendArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="20" />
      <line x1="12" y1="5" x2="6" y2="11" />
      <line x1="12" y1="5" x2="18" y2="11" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

// ─── Footer ──────────────────────────────────────────────

function ReadingFooter({
  state,
  onExit,
}: {
  state: ReadingState;
  onExit: () => void;
}) {
  if (state.phase === 'done' || state.phase === 'error') {
    return (
      <div className="survey__footer">
        <button className="btn btn--quiet" onClick={onExit}>
          close
        </button>
      </div>
    );
  }
  return <div className="survey__footer" />;
}
