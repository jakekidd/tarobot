// Debug inspector — right-hand column, antechamber + debug only. Reveals
// the live engine state we build the dilemma flow against: flow-level
// globals on top, then the current turn's guess (statement, hypothesis,
// predicted response) and the dilemma object (JSON rendered to text)
// below. Re-reads the antechamber snapshot on every debug-bus tick (the
// engine publishes both together on each state change).

import { useEffect, useState, type ReactNode } from 'react';
import { getAntechamberState } from './antechamberStateBus';
import { subscribeDebug } from './debugBus';
import type { EngineState } from '../pipeline/antechamber';

type Props = { visible: boolean };

const GUESS_BUDGET = 20;

export function DebugInspector({ visible }: Props) {
  const [, force] = useState(0);
  useEffect(() => subscribeDebug(() => force((n) => n + 1)), []);
  if (!visible) return null;
  const state = getAntechamberState();
  if (!state) return null;

  const guessesUsed =
    state.transcript.filter((e) => e.kind === 'guess').length + state.guess_queue.length;
  const guess = currentGuess(state);

  return (
    <aside className="debug-inspector" aria-label="debug inspector">
      <Section title="flow">
        <Row k="stage" v={state.stage} />
        <Row k="phase" v={state.phase} />
        <Row k="guesses" v={`${guessesUsed} / ${GUESS_BUDGET}`} />
        <Row k="engagement" v={state.weaver_engagement} />
        <Row k="picks" v={state.picks_log.length} />
        <Row k="banked shapes" v={state.candidate_shapes.length} />
        {state.candidate_shapes.map((s, i) => (
          <div className="debug-inspector__bullet" key={`s${i}`}>· {s}</div>
        ))}
        <Row k="weaver candidates" v={state.weaver_candidates.length} />
        {state.weaver_candidates.map((c, i) => (
          <div className="debug-inspector__bullet" key={`w${i}`}>· {c.label}</div>
        ))}
      </Section>

      <Section title="dilemma · this turn">
        {state.dilemma ? (
          <pre className="debug-inspector__obj">{renderObject(state.dilemma)}</pre>
        ) : (
          <div className="debug-inspector__empty">
            no dilemma object yet — it lands at compiler close; the per-turn
            dilemma flow is not built yet.
          </div>
        )}
      </Section>

      <Section title="guess · this turn">
        {guess ? (
          <>
            <Field label="statement" value={guess.statement} />
            <Field label="hypothesis" value={guess.hypothesis || '—'} />
            <Field label="prediction" value={guess.predicted_response ?? '—'} />
          </>
        ) : (
          <div className="debug-inspector__empty">no guess in flight</div>
        )}
      </Section>
    </aside>
  );
}

function currentGuess(
  state: EngineState,
): { statement: string; hypothesis: string; predicted_response?: 'cold' | 'warm' | 'hot' } | null {
  const head = state.guess_queue[0];
  if (head) {
    return {
      statement: head.statement,
      hypothesis: head.hypothesis,
      predicted_response: head.predicted_response,
    };
  }
  for (let i = state.transcript.length - 1; i >= 0; i--) {
    const e = state.transcript[i];
    if (e.kind === 'guess') return { statement: e.statement, hypothesis: e.hypothesis ?? '' };
  }
  return null;
}

/** JSON -> indented key:value text, the shape the prompt would render. */
function renderObject(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}—`;
  if (typeof obj !== 'object') return `${pad}${String(obj)}`;
  if (Array.isArray(obj)) {
    return obj.length ? obj.map((v) => renderObject(v, indent)).join('\n') : `${pad}(empty)`;
  }
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) =>
      v && typeof v === 'object'
        ? `${pad}${k}:\n${renderObject(v, indent + 1)}`
        : `${pad}${k}: ${String(v)}`,
    )
    .join('\n');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="debug-inspector__section">
      <div className="debug-inspector__head">{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="debug-inspector__row">
      <span className="debug-inspector__k">{k}</span>
      <span className="debug-inspector__v">{v}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug-inspector__field">
      <div className="debug-inspector__k">{label}</div>
      <div className="debug-inspector__field-val">{value}</div>
    </div>
  );
}
