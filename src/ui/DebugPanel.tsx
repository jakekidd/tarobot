import type { InterviewState } from '../pipeline';

type Props = {
  state: InterviewState;
  onClose: () => void;
};

/**
 * Side-drawer cognition view. Shows what tarobot's analysis layer is doing
 * — the things that aren't visible in the dialogue. Toggled from the topbar.
 */
export function DebugPanel({ state, onClose }: Props) {
  const a = state.last_analysis;
  const p = state.partial_profile;

  return (
    <aside className="debug-panel" role="complementary" aria-label="cognition state">
      <header className="debug-panel__head">
        <h3>cognition</h3>
        <button className="btn btn--quiet" onClick={onClose}>close</button>
      </header>

      <div className="debug-panel__scroll">
        {a && (
          <Section title="last turn analysis">
            <Row label="stance">{a.stance}</Row>
            <Row label="register">{a.register_read}</Row>
            {a.absent_domains && a.absent_domains.length > 0 && (
              <Row label="absent">{a.absent_domains.join(', ')}</Row>
            )}
            {a.verbal_tells && a.verbal_tells.length > 0 && (
              <Row label="tells">
                <ul className="debug-panel__list">
                  {a.verbal_tells.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </Row>
            )}
          </Section>
        )}

        <Section title={`response format (${state.response_format ?? 'open'})`}>
          {state.response_options && (
            <div className="debug-panel__chips">
              {state.response_options.map((o, i) => (
                <span key={i} className="chip chip--mini">{o}</span>
              ))}
            </div>
          )}
        </Section>

        <Section title={`candidates (${state.candidates.length})`}>
          {state.candidates.length === 0 ? (
            <Empty />
          ) : (
            state.candidates.map((c, i) => (
              <div key={i} className="debug-panel__card">
                <div className="debug-panel__card-head">
                  <span className="debug-panel__source">{c.source}</span>
                  <span className="debug-panel__scores">
                    s{c.stakes}/t{c.time_proximity}/e{c.user_engagement}
                  </span>
                </div>
                <div className="debug-panel__card-body">{c.description}</div>
                <div className="debug-panel__card-options">
                  {c.options.map((o, j) => <span key={j}>· {o}</span>)}
                </div>
                {c.notes && (
                  <div className="debug-panel__card-notes">{c.notes}</div>
                )}
              </div>
            ))
          )}
        </Section>

        <Section title={`disclosures (${p.disclosures?.length ?? 0})`}>
          {(p.disclosures ?? []).length === 0 ? <Empty /> : (
            (p.disclosures ?? []).map((d, i) => (
              <div key={i} className="debug-panel__card">
                <div className="debug-panel__card-head">
                  <span className="debug-panel__source">{d.domain} · {d.tense}</span>
                  <span className="debug-panel__scores">{Math.round(d.confidence * 100)}%</span>
                </div>
                <div className="debug-panel__card-body">{d.content}</div>
                {d.verbatim_quote && (
                  <div className="debug-panel__card-quote">"{d.verbatim_quote}"</div>
                )}
                <div className="debug-panel__card-notes">affect: {d.affect}</div>
              </div>
            ))
          )}
        </Section>

        <Section title={`hooks (${p.hooks?.length ?? 0})`}>
          {(p.hooks ?? []).length === 0 ? <Empty /> : (
            (p.hooks ?? []).map((h, i) => (
              <div key={i} className="debug-panel__card debug-panel__card--small">
                <span className="debug-panel__scores">{Math.round(h.confidence * 100)}%</span>
                <span>{h.detail}</span>
                <span className="debug-panel__source">{h.source}</span>
              </div>
            ))
          )}
        </Section>

        <Section title="patterns">
          {p.patterns ? (
            <>
              <Row label="register">{p.patterns.language_register}</Row>
              <Row label="reflection">{p.patterns.self_reflection_level}</Row>
              <Row label="posture">{p.patterns.skepticism_posture}</Row>
              {p.patterns.avoidances.length > 0 && (
                <Row label="avoiding">{p.patterns.avoidances.join(', ')}</Row>
              )}
            </>
          ) : <Empty />}
        </Section>

        <Section title="budget">
          <Row label="turns">
            {state.turns_used} / {state.turns_used + state.turns_remaining}
          </Row>
          {state.closed && (
            <Row label="closed">{state.closing_reason ?? 'yes'}</Row>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="debug-panel__section">
      <h4 className="debug-panel__heading">{title}</h4>
      <div className="debug-panel__body">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="debug-panel__row">
      <span className="debug-panel__label">{label}</span>
      <span className="debug-panel__value">{children}</span>
    </div>
  );
}

function Empty() {
  return <div className="debug-panel__empty">—</div>;
}
