import type { InterviewState } from '../pipeline';

type Props = {
  state: InterviewState;
  onClose: () => void;
};

/**
 * Cognition view — left half of the split-screen layout when debug is on.
 * Clean monospace terminal-style text. Left-aligned. No cards or chips.
 */
export function DebugPanel({ state, onClose }: Props) {
  const a = state.last_analysis;
  const p = state.partial_profile;
  const ns = state.negative_space ?? [];

  return (
    <aside className="debug-pane" role="complementary" aria-label="cognition state">
      <header className="debug-pane__head">
        <span className="debug-pane__title">// cognition</span>
        <button className="debug-pane__close" onClick={onClose}>close</button>
      </header>

      <div className="debug-pane__scroll">
        {a && (
          <Block label="last_analysis">
            <Line k="stance" v={a.stance} />
            <Line k="register" v={a.register_read} />
            {a.absent_domains && a.absent_domains.length > 0 && (
              <Line k="absent" v={a.absent_domains.join(', ')} />
            )}
            {a.verbal_tells && a.verbal_tells.length > 0 && (
              <BlockList label="tells" items={a.verbal_tells} />
            )}
          </Block>
        )}

        <Block label={`negative_space [${ns.length}]`}>
          {ns.length === 0 ? (
            <Empty />
          ) : ns.map((g, i) => (
            <div key={i} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">{g.status[0]}</span>
                <span className="debug-pane__conf">{Math.round(g.confidence * 100).toString().padStart(2, '0')}%</span>
                <span>{g.guess}</span>
              </div>
              {g.rationale && (
                <div className="debug-pane__entry-sub">// {g.rationale}</div>
              )}
            </div>
          ))}
        </Block>

        <Block label={`suggestions [${(state.suggested_answers ?? []).length}]`}>
          {(state.suggested_answers ?? []).length === 0 ? (
            <Empty />
          ) : (state.suggested_answers ?? []).map((s, i) => (
            <div key={i} className="debug-pane__entry-line">
              <span className="debug-pane__tag">{state.is_binary ? 'B' : 'C'}</span>
              <span>{s}</span>
            </div>
          ))}
        </Block>

        <Block label={`candidates [${state.candidates.length}]`}>
          {state.candidates.length === 0 ? (
            <Empty />
          ) : state.candidates.map((c, i) => (
            <div key={i} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">{c.source[0]?.toUpperCase()}</span>
                <span className="debug-pane__scores">s{c.stakes}/t{c.time_proximity}/e{c.user_engagement}</span>
                <span>{c.description}</span>
              </div>
              <div className="debug-pane__entry-sub">→ {c.options.join(' | ')}</div>
              {c.notes && <div className="debug-pane__entry-sub">// {c.notes}</div>}
            </div>
          ))}
        </Block>

        <Block label={`disclosures [${(p.disclosures ?? []).length}]`}>
          {(p.disclosures ?? []).length === 0 ? (
            <Empty />
          ) : (p.disclosures ?? []).map((d, i) => (
            <div key={i} className="debug-pane__entry">
              <div className="debug-pane__entry-line">
                <span className="debug-pane__tag">{d.domain[0]?.toUpperCase()}</span>
                <span className="debug-pane__conf">{Math.round(d.confidence * 100)}%</span>
                <span>{d.content}</span>
              </div>
              {d.verbatim_quote && (
                <div className="debug-pane__entry-sub">"{d.verbatim_quote}"</div>
              )}
              <div className="debug-pane__entry-sub">// {d.tense} · {d.affect}</div>
            </div>
          ))}
        </Block>

        <Block label={`hooks [${(p.hooks ?? []).length}]`}>
          {(p.hooks ?? []).length === 0 ? (
            <Empty />
          ) : (p.hooks ?? []).map((h, i) => (
            <div key={i} className="debug-pane__entry-line">
              <span className="debug-pane__conf">{Math.round(h.confidence * 100)}%</span>
              <span>{h.detail}</span>
              <span className="debug-pane__entry-sub">[{h.source}]</span>
            </div>
          ))}
        </Block>

        <Block label="patterns">
          {p.patterns ? (
            <>
              <Line k="register" v={p.patterns.language_register} />
              <Line k="reflection" v={p.patterns.self_reflection_level} />
              <Line k="posture" v={p.patterns.skepticism_posture} />
              {p.patterns.avoidances.length > 0 && (
                <Line k="avoiding" v={p.patterns.avoidances.join(', ')} />
              )}
            </>
          ) : <Empty />}
        </Block>

        <Block label="budget">
          <Line k="turns" v={`${state.turns_used} / ${state.turns_used + state.turns_remaining}`} />
          {state.closed && <Line k="closed" v={state.closing_reason ?? 'yes'} />}
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

function BlockList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="debug-pane__line">
      <span className="debug-pane__line-key">{label}:</span>
      <span className="debug-pane__line-val">
        {items.map((it, i) => <div key={i}>· {it}</div>)}
      </span>
    </div>
  );
}

function Empty() {
  return <div className="debug-pane__empty">—</div>;
}
