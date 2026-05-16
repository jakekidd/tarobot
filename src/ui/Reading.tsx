// Reading screen — fan-out pipeline interface. The seer reads four cards
// in a diamond. The user picks which face-down card to flip next.
//
// Cards live in a 3D scene (TableScene) on a procedural cloth-draped
// table. Each phase maps a per-slot stage (face_down / face_up / lifted)
// which the scene tweens between. The flip plays out as the rotation
// from face_down → face_up; the lift fires once the beat is being
// delivered.
//
// Phase → render mapping:
//   thinking            → stall over empty stage
//   intro               → typewriter line, advances on tap
//   awaiting_flip       → cards clickable in the scene; chat enabled
//   flipping            → card tweens face_down → face_up
//   beat_pending        → card tweens face_up → lifted (stall in stage)
//   beat                → typewriter monologue; subtitle visible
//   chat_pending        → stall in the chat panel
//   closing_thinking    → stall while closing cognition+persona run
//   outro               → typewriter outro; advances on tap
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
import { TableScene, type SlotName, type CardStage } from './scene/TableScene';
import { Spinner } from './Spinner';
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

  // The reader is the seer (eyes) during the reading. Restore cat on exit
  // so menu/survey go back to Clat.
  useEffect(() => {
    setReaderMode('eyes');
    return () => setReaderMode('cat');
  }, []);

  // Drive the flip → beat transition once CSS animation has played.
  useEffect(() => {
    if (state.phase !== 'flipping') return;
    const t = window.setTimeout(() => engine.advanceFromFlip(), FLIP_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, engine]);

  useEffect(() => () => setDizzy(false), []);

  // Per-slot stage. Already-revealed slots are face_up; the current slot
  // overrides to face_up during flipping (tween animates the half-turn)
  // and lifted during beat_pending/beat (close-to-camera).
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

  // Card name for the subtitle, derived from the active slot's drawn card.
  const activeCardName = useMemo(() => {
    if (!state.current_slot) return null;
    const dc = drawn.cards.find((c) => c.position.id === state.current_slot);
    return dc?.card.name ?? null;
  }, [state.current_slot, drawn]);

  const subtitleVisible =
    state.phase === 'beat_pending' || state.phase === 'beat';

  return (
    <div className="screen screen--reading">
      <div className="reading__rig">
        <div className="reading__head">
          <ReaderAnchor size={150} />
        </div>
        <div className="reading__stage-slot">
          <ReadingStage state={state} engine={engine} />
        </div>
        <CardSubtitle name={activeCardName} visible={subtitleVisible} />
        <div className="reading__table-slot">
          <TableScene
            drawn={drawn}
            stages={stages}
            pickable={state.phase === 'awaiting_flip'}
            onPick={(slot) => engine.pickSlot(slot)}
            width={760}
            height={420}
          />
        </div>
        <div className="reading__chat-slot">
          <ChatPanel
            state={state}
            onSend={(text) => void engine.submitChat(text)}
          />
        </div>
        <ReadingFooter state={state} onExit={onExit} />
      </div>
    </div>
  );
}

// ─── Card subtitle (briefly shows card name when lifted) ─────

function CardSubtitle({
  name,
  visible,
}: {
  name: string | null;
  visible: boolean;
}) {
  const display = name ?? '';
  return (
    <div
      className={`card-subtitle ${visible && display ? 'card-subtitle--on' : ''}`}
      aria-live="polite"
    >
      {display.toUpperCase()}
    </div>
  );
}

// ─── Stage (intro / beat / outro / stall) ────────────────

type StageProps = { state: ReadingState; engine: ReadingEngine };

function ReadingStage({ state, engine }: StageProps) {
  if (state.phase === 'idle' || state.phase === 'thinking') {
    return <StallLine tier="persona" label="opening the reading" />;
  }
  if (state.phase === 'error') {
    return <div className="reading__error">{state.error ?? 'something went wrong.'}</div>;
  }
  if (state.phase === 'intro' && state.intro) {
    return (
      <TypedLine
        key="intro"
        kind="intro"
        text={state.intro.text}
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
      <TypedLine
        key={`beat-${state.current_slot}-${state.revealed.length}`}
        kind="beat"
        text={monologue.text}
        onAdvance={() => engine.advanceFromBeat()}
      />
    );
  }
  if (state.phase === 'closing_thinking') {
    return <StallLine tier={state.awaiting_tier ?? 'cognition'} label="closing" />;
  }
  if (state.phase === 'outro' && state.outro) {
    return (
      <TypedLine
        key="outro"
        kind="outro"
        text={state.outro.text}
        onAdvance={() => engine.advanceFromOutro()}
      />
    );
  }
  if (state.phase === 'done' && state.outro) {
    return <div className="reading__outro">{state.outro.text}</div>;
  }
  return null;
}

// ─── Stall line (catchphrase by tier) ────────────────────

function StallLine({ tier, label }: { tier: 'cognition' | 'persona'; label: string }) {
  // Hold one stall per mount so it doesn't flicker on re-renders.
  const phrase = useMemo(() => pickStall(tier), [tier]);
  return (
    <div className={`reading__stall reading__stall--${tier}`}>
      <Spinner label={label || phrase} />
    </div>
  );
}

// ─── Typed line (intro / beat / outro) ───────────────────

function TypedLine({
  kind,
  text,
  onAdvance,
}: {
  kind: 'intro' | 'beat' | 'outro';
  text: string;
  onAdvance: () => void;
}) {
  const settings = useMemo(() => loadSettings(), []);
  const { displayed, done, skip } = useTypewriter(
    text.toLowerCase(),
    settings.charDelayMs,
  );
  return (
    <div
      className={`reading__${kind}`}
      onClick={done ? onAdvance : skip}
      role="button"
      tabIndex={0}
    >
      {displayed}
      {done && <span aria-hidden>  ▸</span>}
    </div>
  );
}

// ─── Chat panel ──────────────────────────────────────────

function ChatPanel({
  state,
  onSend,
}: {
  state: ReadingState;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = state.phase === 'awaiting_flip' || state.phase === 'done';
  const showStall = state.phase === 'chat_pending';
  const activePrompt = state.active_prompt_to_user;

  // When the seer invites a response, focus the chat input so the user
  // can type immediately. Only fires on transitions, not every render.
  useEffect(() => {
    if (activePrompt && canSend) {
      inputRef.current?.focus();
    }
  }, [activePrompt, canSend]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="reading__chat">
      {state.chat.length > 0 && (
        <div className="reading__chat-log">
          {state.chat.map((m, i) => (
            <div
              key={i}
              className={`reading__chat-line reading__chat-line--${m.speaker}`}
            >
              <span className="reading__chat-who">
                {m.speaker === 'user' ? 'you' : 'the seer'}
              </span>
              <span className="reading__chat-text">{m.text}</span>
            </div>
          ))}
          {showStall && (
            <div className="reading__chat-line reading__chat-line--seer reading__chat-line--stall">
              <span className="reading__chat-who">the seer</span>
              <span className="reading__chat-text">
                <em>{pickStall('persona')}</em>
              </span>
            </div>
          )}
        </div>
      )}
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
