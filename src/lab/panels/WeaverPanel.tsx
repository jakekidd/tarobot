// Bench panel — Weaver.
// Candidate dilemmas with trajectory metadata + engagement state.
// Each candidate is a card showing label, description, every thought,
// and the engine-maintained trajectory fields so you can see
// durability across passes.

import { Panel, Empty, Pill } from '../lib';
import type { EngineState } from '../../pipeline/antechamber';

type Props = { state: EngineState };

export function WeaverPanel({ state }: Props) {
  const candidates = state.weaver_candidates;
  return (
    <Panel
      title="weaver"
      meta={
        <span className="bench__row bench__row--gap-2">
          <Pill variant={engagementVariant(state.weaver_engagement)}>
            {state.weaver_engagement}
          </Pill>
          <span className="bench__panel-meta">
            run {state.weaver_run_count}  ·  {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
          </span>
        </span>
      }
    >
      {candidates.length === 0 ? (
        <Empty>no candidates yet — weaver fires every 2 answered guesses</Empty>
      ) : (
        <div className="bench__stack bench__stack--gap-2">
          {candidates.map((c) => (
            <div key={c.label} className="bench__candidate">
              <div className="bench__candidate-head">
                <span className="bench__candidate-label">{c.label}</span>
                <span className="bench__row bench__row--gap-2">
                  {c.extension_count !== undefined && c.extension_count > 0 && (
                    <Pill variant="good">ext × {c.extension_count}</Pill>
                  )}
                  {c.created_at_turn !== undefined && (
                    <span className="bench__text-faint bench__text-sm bench__text-mono">
                      first@{c.created_at_turn}
                    </span>
                  )}
                </span>
              </div>
              <div className="bench__candidate-desc">{c.description}</div>
              {c.thoughts.length === 0 ? (
                <div className="bench__text-faint bench__text-sm">(no thoughts)</div>
              ) : (
                <div className="bench__stack bench__stack--gap-1">
                  {c.thoughts.map((t, i) => (
                    <div key={i} className="bench__candidate-thought">{t}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function engagementVariant(e: EngineState['weaver_engagement']): 'good' | 'warn' | 'hot' {
  if (e === 'live') return 'good';
  if (e === 'wind_down') return 'warn';
  return 'hot';
}
