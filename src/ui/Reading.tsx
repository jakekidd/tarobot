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

import { useEffect, useMemo, useRef, useState } from 'react';
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
  pickStall,
} from '../pipeline/reading';
import { ReaderAnchor } from './scene/ReaderAnchor';
import { TableAnchor } from './scene/TableAnchor';
import {
  setCardScene,
  type CardStage,
  type SlotName,
} from './scene/cardSceneStore';
import { Spinner } from './Spinner';
import { Transcript } from './Transcript';
import { useTypewriter } from './dialogue/useTypewriter';
import { setDizzy } from './scene/dizzyStore';
import { setReaderMode } from './scene/readerModeStore';
import { loadSettings } from '../storage';

type Props = {
  apiKey: string;
  brief: CompilerOutput;
  preferredIntro?: Monologue;
  onExit: () => void;
};

const FLIP_ANIM_MS = 950;
// Soft cap per dialogue chunk (chars). The rigid box holds ~four lines
// of monologue text; this picks the sentence boundary nearest the cap.
const CHUNK_MAX_CHARS = 260;

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

  useEffect(() => {
    const unsub = engine.subscribe(setStateLocal);
    void engine.start();
    return unsub;
  }, [engine]);

  // Dizzy while we're awaiting an LLM call (any tier).
  useEffect(() => {
    setDizzy(state.awaiting_tier !== null);
    return () => setDizzy(false);
  }, [state.awaiting_tier]);

  // Eyes face on the reader anchor; restore cat when we leave.
  useEffect(() => {
    setReaderMode('eyes');
    return () => setReaderMode('cat');
  }, []);

  // Drive flip-tween → engine handoff once the CSS-3D rotation has played.
  useEffect(() => {
    if (state.phase !== 'flipping') return;
    const t = window.setTimeout(() => engine.advanceFromFlip(), FLIP_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, engine]);

  useEffect(() => () => setDizzy(false), []);

  // Per-slot stage map for the perspective layer.
  const stages = useMemo<Partial<Record<SlotName, CardStage>>>(() => {
    const m: Partial<Record<SlotName, CardStage>> = {};
    for (const r of state.revealed) {
      m[r.position_id as SlotName] = 'face_up';
    }
    if (state.current_slot) {
      const slot = state.current_slot as SlotName;
      if (state.phase === 'flipping') m[slot] = 'face_up';
      else if (state.phase === 'beat_pending' || state.phase === 'beat') m[slot] = 'lifted';
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

  // Screen-wide click-to-advance. ChunkedLine watches advanceTick and
  // calls its tap() when it bumps. Clicks on interactive zones (input,
  // button, table-anchor, transcript-fullpage) are excluded.
  const [advanceTick, setAdvanceTick] = useState(0);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  function onScreenClick(e: React.MouseEvent<HTMLDivElement>) {
    if (transcriptOpen) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, button, .table-anchor, .reading__chat')) return;
    // Only advance when in an advance-able phase
    if (state.phase === 'intro' || state.phase === 'beat' || state.phase === 'outro') {
      setAdvanceTick((t) => t + 1);
    }
  }

  return (
    <div className="screen screen--reading" onClick={onScreenClick}>
      <div className="reading__cols">
        <aside className="reading__col-left">
          <Transcript
            messages={state.chat}
            stallShown={state.phase === 'chat_pending'}
          />
        </aside>

        <section className="reading__col-right">
          <div className="reading__head">
            <ReaderAnchor size={140} />
          </div>

          <div className="reading__stage-slot">
            <ReadingStage state={state} engine={engine} advanceTick={advanceTick} />
          </div>

          {/* table-rig: relative-positioned wrapper so subtitle + chat are
              absolute overlays anchored to the table — they never push
              flow around when they appear/disappear. */}
          <div className="reading__table-rig">
            <TableAnchor pickable={pickable} onPick={(slot) => engine.pickSlot(slot)} />
            <CardSubtitle name={activeCardName} visible={subtitleVisible} />
            <div className="reading__chat-slot">
              <ChatForm state={state} onSend={(text) => void engine.submitChat(text)} />
            </div>
          </div>

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
              messages={state.chat}
              stallShown={state.phase === 'chat_pending'}
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
  // Split into letters so each gets its own animation phase. Spaces stay
  // as non-animated gaps.
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

// ─── Stage (intro / beat / outro / stall) ────────────────

type StageProps = { state: ReadingState; engine: ReadingEngine; advanceTick: number };

function ReadingStage({ state, engine, advanceTick }: StageProps) {
  if (state.phase === 'idle' || state.phase === 'thinking') {
    return <StallLine tier="persona" label="opening the reading" />;
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
        onAdvance={() => engine.advanceFromIntro()}
      />
    );
  }
  if (state.phase === 'awaiting_flip') {
    return (
      <div className="reading__cue">
        <em>pick a card.</em>
      </div>
    );
  }
  if (state.phase === 'flipping' || state.phase === 'beat_pending') {
    return <StallLine tier={state.awaiting_tier ?? 'persona'} label="" />;
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
        onAdvance={() => engine.advanceFromBeat()}
      />
    );
  }
  if (state.phase === 'closing_thinking') {
    return <StallLine tier={state.awaiting_tier ?? 'cognition'} label="closing" />;
  }
  if (state.phase === 'outro' && state.outro) {
    return (
      <ChunkedLine
        key="outro"
        kind="outro"
        text={state.outro.text}
        advanceTick={advanceTick}
        onAdvance={() => engine.advanceFromOutro()}
      />
    );
  }
  if (state.phase === 'done' && state.outro) {
    return <div className="reading__outro">{state.outro.text}</div>;
  }
  return null;
}

// ─── Stall line ──────────────────────────────────────────

function StallLine({ tier, label }: { tier: 'cognition' | 'persona'; label: string }) {
  const phrase = useMemo(() => pickStall(tier), [tier]);
  return (
    <div className={`reading__stall reading__stall--${tier}`}>
      <Spinner label={label || phrase} />
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
  onAdvance,
}: {
  kind: 'intro' | 'beat' | 'outro';
  text: string;
  advanceTick: number;
  onAdvance: () => void;
}) {
  const chunks = useMemo(() => chunkText(text, CHUNK_MAX_CHARS), [text]);
  const [idx, setIdx] = useState(0);
  const settings = useMemo(() => loadSettings(), []);
  const current = chunks[idx] ?? '';
  const { displayed, done, skip } = useTypewriter(
    current.toLowerCase(),
    settings.charDelayMs,
  );
  const isLast = idx >= chunks.length - 1;

  function tap() {
    if (!done) skip();
    else if (!isLast) setIdx(idx + 1);
    else onAdvance();
  }

  // Screen-wide click: parent increments advanceTick → we call tap with
  // the LATEST state. Ref is updated in an effect (React 19 strict lint
  // forbids ref assignment during render).
  const tapRef = useRef(tap);
  // tap is a fresh closure each render — keep the ref pointing at the
  // latest one. No deps array → fires every render (cheap; just a ref
  // assignment).
  useEffect(() => { tapRef.current = tap; });
  const lastTickRef = useRef(advanceTick);
  useEffect(() => {
    if (advanceTick === lastTickRef.current) return;
    lastTickRef.current = advanceTick;
    tapRef.current();
  }, [advanceTick]);

  const caret = !done ? '' : isLast ? ' ▸' : ' …';

  return (
    <div
      className={`reading__${kind} reading__dialogue-rigid`}
      onClick={tap}
      role="button"
      tabIndex={0}
    >
      <span>{displayed}{done && <span aria-hidden>{caret}</span>}</span>
    </div>
  );
}

function chunkText(text: string, maxLen: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return [trimmed];
  // Split into sentences (keep terminator + trailing whitespace with each).
  const sentences = trimmed.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) ?? [trimmed];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf.length === 0) {
      buf = s;
    } else if (buf.length + s.length <= maxLen) {
      buf += s;
    } else {
      out.push(buf.trim());
      buf = s;
    }
  }
  if (buf) out.push(buf.trim());
  // If a single sentence is itself longer than maxLen, hard-split it.
  const final: string[] = [];
  for (const c of out) {
    if (c.length <= maxLen) {
      final.push(c);
    } else {
      for (let i = 0; i < c.length; i += maxLen) {
        final.push(c.slice(i, i + maxLen));
      }
    }
  }
  return final;
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
      <form className="reading__chat-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="reading__chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend}
          placeholder={
            !canSend
              ? 'wait for the seer to finish...'
              : activePrompt
                ? '...'
                : 'say something to the seer'
          }
          aria-label="chat with the seer"
        />
        <button
          type="submit"
          className="btn btn--ghost reading__chat-send"
          disabled={!canSend || draft.trim().length === 0}
        >
          SEND
        </button>
      </form>
    </div>
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
