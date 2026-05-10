import type { EngineState } from '../pipeline';

type Props = {
  state: EngineState;
  onClose: () => void;
};

/**
 * Cognition view — left half of the split-screen layout when debug is on.
 * Clean monospace terminal-style text. Left-aligned. No cards or chips.
 */
export function DebugPanel({ state, onClose }: Props) {
  const p = state.profile;

  return (
    <aside className="debug-pane" role="complementary" aria-label="cognition state">
      <header className="debug-pane__head">
        <span className="debug-pane__title">// cognition</span>
        <button className="debug-pane__close" onClick={onClose}>close</button>
      </header>

      <div className="debug-pane__scroll">
        <Block label={`brief (v${p.version})`}>
          <div className="debug-pane__line-val">{p.brief || '—'}</div>
        </Block>

        <Block label={`highlights [${p.highlights.length}]`}>
          {p.highlights.length === 0 ? <Empty /> : p.highlights.map((h) => (
            <div key={h.id} className="debug-pane__entry-line">
              <span className="debug-pane__tag">{h.salience[0]?.toUpperCase()}</span>
              <span className="debug-pane__conf">ttl{h.ttl}</span>
              <span>{h.topic}</span>
            </div>
          ))}
        </Block>

        <Block label={`candidates [${p.candidates.length}]`}>
          {p.candidates.length === 0 ? <Empty /> : p.candidates.map((c) => (
            <div key={c.id} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">{c.is_target ? '*' : c.source[0]?.toUpperCase()}</span>
                <span className="debug-pane__scores">
                  s{c.scores.stakes}/t{c.scores.time_proximity}/e{c.scores.user_engagement}
                </span>
                <span>{c.description}</span>
              </div>
              <div className="debug-pane__entry-sub">
                → {c.options.map((o) => o.name).join(' | ')}
              </div>
              {c.notes && <div className="debug-pane__entry-sub">// {c.notes}</div>}
            </div>
          ))}
        </Block>

        <Block label={`cast [${p.cast.length}]`}>
          {p.cast.length === 0 ? <Empty /> : p.cast.map((c, i) => (
            <div key={i} className="debug-pane__entry-line">
              <span className="debug-pane__tag">{c.role[0]?.toUpperCase()}</span>
              <span>{c.role}{c.name ? ` — ${c.name}` : ''}</span>
              <span className="debug-pane__entry-sub">{c.valence}</span>
            </div>
          ))}
        </Block>

        <Block label={`threads [${p.threads.length}]`}>
          {p.threads.length === 0 ? <Empty /> : p.threads.map((t, i) => (
            <div key={i} className="debug-pane__entry-line">
              <span className="debug-pane__conf">×{t.observations.length}</span>
              <span>{t.pattern}</span>
            </div>
          ))}
        </Block>

        <Block label={`hunches [${p.hunches.length}]`}>
          {p.hunches.length === 0 ? <Empty /> : p.hunches.map((h, i) => (
            <div key={i} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__conf">{Math.round(h.confidence * 100)}%</span>
                <span>{h.suspicion}</span>
              </div>
              <div className="debug-pane__entry-sub">// {h.grounded_in}</div>
            </div>
          ))}
        </Block>

        <Block label={`queue [${state.question_queue.length}]`}>
          {state.current_question && (
            <div className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">▶</span>
                <span>{state.current_question.prompt}</span>
              </div>
              <div className="debug-pane__entry-sub">
                opts: {state.current_question.options.join(' | ')}
              </div>
            </div>
          )}
          {state.question_queue.map((q, i) => (
            <div key={i} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">{i + 1}</span>
                <span>{q.prompt}</span>
              </div>
              <div className="debug-pane__entry-sub">
                opts: {q.options.join(' | ')}
              </div>
            </div>
          ))}
        </Block>

        {p.margin && (
          <Block label="margin">
            <div className="debug-pane__line-val">{p.margin}</div>
          </Block>
        )}

        {p.cognition_log && (
          <Block label="cognition log">
            <pre className="debug-pane__pre">{p.cognition_log}</pre>
          </Block>
        )}

        <Block label="state">
          <Line k="turn" v={String(state.turn_count)} />
          <Line k="closed" v={state.closed ? 'yes' : 'no'} />
          <Line k="ready_to_close" v={p.ready_to_close ? 'yes' : 'no'} />
        </Block>
      </div>
    </aside>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="debug-pane__block">
      <h4 className="debug-pane__block-head">// {label}</h4>
      <div className="debug-pane__block-body">{children}</div>
    </section>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="debug-pane__line">
      <span className="debug-pane__line-key">{k}:</span>
      <span className="debug-pane__line-val">{v}</span>
    </div>
  );
}

function Empty() {
  return <div className="debug-pane__empty">—</div>;
}
