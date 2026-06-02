// Bench view — Dowser focus.
//
// Auto-bootstraps a session with the DEFAULT_PERSONA (alice, 1991-01-01,
// partnered with theo, anxious-leaning, freedom-over-security), then
// drops the user straight into the interrogation phase: guess →
// COLD/WARM/HOT → next guess. Strict serialization (lookaheadCap=1)
// — no speculative ahead-of-time generation. Soft ceiling raised so
// the dowser can cook unbounded.
//
// The view is single-column, dense, lab-equipment-flat. Top: session
// status + new-session button. Below: current guess + three
// buttons + correction follow-up. Below that: thinking trace,
// hypotheses, transcript. The point of this view is fast iteration
// on the dowser prompt — refine, restart, refine.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnthropicAdapter,
  AntechamberEngine,
  type EngineState,
  type RenderedQuestion,
} from '../../pipeline/antechamber';
import { createClaudeClient } from '../../pipeline/claude';
import { ColdWarmHot } from '../inputs/ColdWarmHot';
import { Button, Empty, Panel, Pill, Row, Stack, Stream } from '../lib';
import { bootstrapWithPersona, DEFAULT_PERSONA } from '../bootstrap';

type Props = { apiKey: string };

export function Dowser({ apiKey }: Props) {
  const [resetKey, setResetKey] = useState(0);

  // Construct engine per resetKey — strict serial + unbounded for
  // dowser-refinement work.
  const engine = useMemo(() => {
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
    return new AntechamberEngine({
      adapter,
      lookaheadCap: 1,        // one guess at a time
      softCeiling: 999,       // let it cook; user new-sessions when they're done
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, resetKey]);

  const [state, setState] = useState<EngineState>(() => engine.getState());
  const bootstrapStartedRef = useRef(false);

  // Subscribe to engine updates.
  useEffect(() => {
    return engine.subscribe((s) => setState(s));
  }, [engine]);

  // Auto-bootstrap once per engine.
  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    void bootstrapWithPersona(engine, DEFAULT_PERSONA);
    return () => { bootstrapStartedRef.current = false; };
  }, [engine]);

  function newSession() {
    setResetKey((k) => k + 1);
  }

  const currentQ = engine.getCurrentQuestion();
  const inInterrogation = state.stage === 'questions'
    && state.queue.length === 0
    && (currentQ?.format === 'guess' || state.thinking);

  return (
    <Stack gap={5}>
      <SessionBar state={state} onNewSession={newSession} />
      <InteractionArea
        state={state}
        currentQ={currentQ}
        onAnswer={(a) => { void engine.submitAnswer(a); }}
        inInterrogation={inInterrogation}
      />
      <Panel
        title="thinking"
        meta={<span className="bench__text-mono bench__text-sm">{state.dowser_thinking ? `${state.dowser_thinking.length} chars` : '0 chars'}</span>}
      >
        <Stream
          text={state.dowser_thinking}
          emptyHint={inInterrogation ? '(dowser is forming first thoughts...)' : '(bootstrapping persona...)'}
          maxHeight={420}
        />
      </Panel>
      <Panel
        title="hypotheses"
        meta={<span className="bench__panel-meta">{state.hypotheses.length}</span>}
      >
        {state.hypotheses.length === 0 ? (
          <Empty>none yet</Empty>
        ) : (
          <Stack gap={1}>
            {state.hypotheses.map((h, i) => (
              <div key={i} className="bench__row bench__row--gap-2" style={{ alignItems: 'baseline' }}>
                <Pill>h{i + 1}</Pill>
                <span style={{ flex: 1 }} className="bench__text-mono bench__text-sm">{h}</span>
              </div>
            ))}
          </Stack>
        )}
      </Panel>
      <Panel
        title="transcript"
        meta={<span className="bench__panel-meta">{state.transcript.length} entries</span>}
      >
        <TranscriptLog state={state} />
      </Panel>
    </Stack>
  );
}

// ─── Session bar ─────────────────────────────────────────

function SessionBar({
  state,
  onNewSession,
}: {
  state: EngineState;
  onNewSession: () => void;
}) {
  const guessesAsked = state.transcript.filter((e) => e.kind === 'guess').length;
  return (
    <div className="bench__run-controls">
      <Row gap={3}>
        <span className="bench__text-mono bench__text-sm bench__text-faint">{state.session_id}</span>
        <Pill variant="accent">{state.stage}</Pill>
        <span className="bench__text-mono bench__text-sm bench__text-muted">
          {guessesAsked} guess{guessesAsked === 1 ? '' : 's'} asked
        </span>
        {state.thinking && <Pill variant="warn">thinking</Pill>}
      </Row>
      <Row gap={2}>
        <Button onClick={onNewSession} variant="danger">new session</Button>
      </Row>
    </div>
  );
}

// ─── Interaction area ────────────────────────────────────

function InteractionArea({
  state,
  currentQ,
  onAnswer,
  inInterrogation,
}: {
  state: EngineState;
  currentQ: RenderedQuestion | null;
  onAnswer: (a: string) => void;
  inInterrogation: boolean;
}) {
  void inInterrogation;
  // The bootstrap clicks through openers + pillars programmatically.
  // If we're still in the bootstrap phase, show a status note rather
  // than auto-submit forms — the user shouldn't see openers/pillars
  // here. Once we land in 'guess' format, show the COLD/WARM/HOT
  // interface.
  if (state.stage !== 'questions') {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow">{state.stage}</div>
        <div className="bench__qcard-q bench__text-muted">
          {state.stage === 'awaiting_intention'
            ? 'dowser handed off — interrogation complete'
            : 'session closed; new session to refine again'}
        </div>
      </div>
    );
  }

  if (currentQ && currentQ.format === 'guess' && currentQ.instrument?.kind === 'guess') {
    return (
      <div>
        <div className="bench__qcard-eyebrow">guess · A{state.guess_queue[0]?.idx ?? '?'}</div>
        <div className="bench__guess-text">{currentQ.instrument.statement}</div>
        <ColdWarmHot key={currentQ.node_id} onPick={onAnswer} />
      </div>
    );
  }

  // Bootstrapping — opener or pillar in flight. Show a calm status
  // line; the persona auto-fills these in the background.
  return (
    <div className="bench__qcard">
      <div className="bench__qcard-eyebrow">bootstrap · {currentQ?.format ?? 'idle'}</div>
      <div className="bench__qcard-q bench__text-muted">
        auto-filling openers + pillars with the default persona (alice, 1991-01-01)...
      </div>
    </div>
  );
}

// ─── Transcript ──────────────────────────────────────────

function TranscriptLog({ state }: { state: EngineState }) {
  // Only show guesses + responses in this view — the openers and
  // pillars were auto-filled and aren't part of the iteration loop
  // here. Hide the pick entries.
  const entries = state.transcript.filter(
    (e) => e.kind === 'guess' || e.kind === 'response'
  );
  if (entries.length === 0) {
    return <Empty>no guesses yet</Empty>;
  }
  return (
    <div className="bench__transcript">
      {entries.map((e, i) => {
        if (e.kind === 'guess') {
          return (
            <div key={i} className="bench__transcript-entry bench__transcript-entry--guess">
              <div className="bench__transcript-q">A{e.guess_idx}. {e.statement}</div>
            </div>
          );
        }
        const cls = `bench__transcript-entry bench__transcript-entry--response-${e.direction}`;
        return (
          <div key={i} className={cls}>
            <div className="bench__row bench__row--gap-2" style={{ alignItems: 'baseline' }}>
              <Pill variant={e.direction === 'hot' ? 'hot' : e.direction === 'warm' ? 'warm' : 'cold'}>
                {e.direction}
              </Pill>
              {e.correction && (
                <span className="bench__text-mono bench__text-sm">"{e.correction}"</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
