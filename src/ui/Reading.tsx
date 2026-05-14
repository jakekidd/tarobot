// Reading screen — mirror-not-oracle phase. The witch reads four cards.
//
// Lifecycle is driven by the ReadingEngine state machine:
//   thinking → intro → flipping → beat → between → flipping → ... → outro → done
//
// We auto-advance on phase boundaries that don't need user input (flipping
// → beat, between → next flipping). For the typed beats and the intro/outro,
// the user taps to continue once typing finishes.

import { useEffect, useMemo, useState } from 'react';
import {
  AnthropicAdapter,
  type CompilerOutput,
} from '../pipeline/survey';
import {
  drawForSpread,
  FOUR_CARD_DIAMOND,
  type DrawnCards,
} from '../pipeline';
import { createClaudeClient } from '../pipeline/claude';
import {
  ReadingEngine,
  readingInputsFromCompiler,
  type ReadingState,
} from '../pipeline/reading';
import { Reader } from './reader/Reader';
import { CardSpread } from './cards/CardSpread';
import { Spinner } from './Spinner';
import { useTypewriter } from './dialogue/useTypewriter';
import { setDizzy } from './scene/dizzyStore';
import { loadSettings } from '../storage';

type Props = {
  apiKey: string;
  brief: CompilerOutput;
  onExit: () => void;
};

const FLIP_ANIM_MS = 950;       // matches the CSS transition duration
const BETWEEN_PAUSE_MS = 700;

export function Reading({ apiKey, brief, onExit }: Props) {
  // Draw the cards exactly once at mount. Faces are known to the engine
  // from this moment forward — the UI animates a reveal that's already
  // determined.
  const drawn: DrawnCards = useMemo(
    () => drawForSpread(FOUR_CARD_DIAMOND),
    [],
  );

  const engine = useMemo(() => {
    const client = createClaudeClient(apiKey);
    const adapter = new AnthropicAdapter(client);
    return new ReadingEngine({
      adapter,
      inputs: readingInputsFromCompiler(brief, drawn),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, drawn]);

  const [state, setStateLocal] = useState<ReadingState>(() => engine.getState());

  useEffect(() => {
    const unsub = engine.subscribe(setStateLocal);
    void engine.start();
    return unsub;
  }, [engine]);

  // Drive dizzy state while we're waiting on cognition + persona.
  useEffect(() => {
    setDizzy(state.phase === 'thinking');
    return () => setDizzy(false);
  }, [state.phase]);

  // Auto-advance flipping → beat after the flip animation, and between →
  // next flip after a short pause. User taps drive intro / beat / outro.
  useEffect(() => {
    if (state.phase === 'flipping') {
      const t = window.setTimeout(() => engine.advance(), FLIP_ANIM_MS);
      return () => window.clearTimeout(t);
    }
    if (state.phase === 'between') {
      const t = window.setTimeout(() => engine.advance(), BETWEEN_PAUSE_MS);
      return () => window.clearTimeout(t);
    }
    return;
  }, [state.phase, engine]);

  // Cleanup: clear dizzy on unmount.
  useEffect(() => () => setDizzy(false), []);

  // ─── derived ─────────────────────────────────────────

  const revealedThroughFlip = computeRevealed(state);
  const activeSlot = state.plan?.cards[state.current_index]?.position_id ?? null;

  return (
    <div className="screen screen--reading">
      <Reader />
      <ReadingTextStage state={state} onAdvance={() => engine.advance()} />
      <CardSpread
        drawn={drawn}
        revealed={revealedThroughFlip}
        active={state.phase === 'flipping' ? activeSlot : null}
      />
      <ReadingFooter
        state={state}
        onAdvance={() => engine.advance()}
        onExit={onExit}
      />
    </div>
  );
}

/** Determine which cards should be face-up given the current phase + index. */
function computeRevealed(state: ReadingState): string[] {
  const ids = [...state.revealed_position_ids];
  // While flipping the current card, treat it as revealed so the CSS-3D
  // transform plays out. The beat phase keeps the same revealed set.
  if (state.plan && (state.phase === 'flipping' || state.phase === 'beat')) {
    const cur = state.plan.cards[state.current_index];
    if (cur && !ids.includes(cur.position_id)) ids.push(cur.position_id);
  }
  return ids;
}

// ─── Text stage (intro / beat / outro / thinking) ────────

type StageProps = {
  state: ReadingState;
  onAdvance: () => void;
};

function ReadingTextStage({ state, onAdvance }: StageProps) {
  if (state.phase === 'idle' || state.phase === 'thinking') {
    return (
      <div className="reading__intro reading__intro--thinking">
        <Spinner label="laying the cards" />
      </div>
    );
  }
  if (state.error) {
    return <div className="reading__error">{state.error}</div>;
  }

  if (state.phase === 'intro' && state.reading) {
    return (
      <IntroLine
        key="intro"
        text={state.reading.intro.toLowerCase()}
        onAdvance={onAdvance}
      />
    );
  }
  if (state.phase === 'beat' && state.reading && state.plan) {
    const angle = state.plan.cards[state.current_index];
    const beat = angle && state.reading.beats.find((b) => b.position_id === angle.position_id);
    if (!beat) return <div className="reading__beat" />;
    return (
      <BeatLine
        key={`beat-${state.current_index}`}
        text={beat.text.toLowerCase()}
        onAdvance={onAdvance}
      />
    );
  }
  if (state.phase === 'flipping' || state.phase === 'between') {
    // Keep the previous beat visible while the next card flips, to anchor
    // the eye. If there's no previous beat yet, render an empty placeholder
    // so the layout doesn't reflow.
    const prevIdx = Math.max(0, state.current_index - (state.phase === 'between' ? 0 : 1));
    const angle = state.plan?.cards[prevIdx];
    const beat = angle && state.reading?.beats.find((b) => b.position_id === angle.position_id);
    return (
      <div className="reading__beat" aria-hidden>
        {beat ? beat.text.toLowerCase() : ''}
      </div>
    );
  }
  if (state.phase === 'outro' && state.reading) {
    return (
      <OutroLine
        key="outro"
        text={state.reading.outro.toLowerCase()}
        onAdvance={onAdvance}
      />
    );
  }
  if (state.phase === 'done' && state.reading) {
    return <div className="reading__outro">{state.reading.outro.toLowerCase()}</div>;
  }
  return null;
}

// ─── Typed lines ─────────────────────────────────────────

function IntroLine({ text, onAdvance }: { text: string; onAdvance: () => void }) {
  const settings = useMemo(() => loadSettings(), []);
  const { displayed, done } = useTypewriter(text, settings.charDelayMs);
  return (
    <div className="reading__intro" onClick={done ? onAdvance : undefined}>
      {displayed}
      {done && <span className="reading__intro-caret" aria-hidden> ▸</span>}
    </div>
  );
}

function BeatLine({ text, onAdvance }: { text: string; onAdvance: () => void }) {
  const settings = useMemo(() => loadSettings(), []);
  const { displayed, done, skip } = useTypewriter(text, settings.charDelayMs);
  return (
    <div
      className="reading__beat"
      onClick={done ? onAdvance : skip}
      role="button"
      tabIndex={0}
    >
      {displayed}
      {done && <span aria-hidden>  ▸</span>}
    </div>
  );
}

function OutroLine({ text, onAdvance }: { text: string; onAdvance: () => void }) {
  const settings = useMemo(() => loadSettings(), []);
  const { displayed, done } = useTypewriter(text, settings.charDelayMs);
  return (
    <div className="reading__outro" onClick={done ? onAdvance : undefined}>
      {displayed}
      {done && <span aria-hidden>  ▸</span>}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────

function ReadingFooter({
  state,
  onAdvance,
  onExit,
}: {
  state: ReadingState;
  onAdvance: () => void;
  onExit: () => void;
}) {
  const advanceLabel = useAdvanceLabel(state);

  // After 'done', keep an exit-to-menu pathway visible.
  if (state.phase === 'done' || state.closed) {
    return (
      <div className="survey__footer">
        <button className="btn btn--quiet" onClick={onExit}>
          close
        </button>
      </div>
    );
  }
  if (!advanceLabel) return <div className="survey__footer" />;

  return (
    <div className="survey__footer">
      <button className="reading__advance" onClick={onAdvance}>
        {advanceLabel}
      </button>
    </div>
  );
}

function useAdvanceLabel(state: ReadingState): string | null {
  if (state.phase === 'intro') return 'begin';
  if (state.phase === 'beat') return 'continue';
  if (state.phase === 'outro') return 'finish';
  return null;
}
