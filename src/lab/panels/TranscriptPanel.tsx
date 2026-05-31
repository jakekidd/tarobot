// Bench panel — Transcript.
// The unified narrative the detective + weaver + compiler read. Renders
// each kind of TranscriptEntry distinctly so picks / assertions /
// responses are visually separable at a glance.

import { Panel, Empty, Pill } from '../lib';
import type { EngineState } from '../../pipeline/survey';
import type { TranscriptEntry } from '../../pipeline/survey/transcript';

type Props = { state: EngineState };

export function TranscriptPanel({ state }: Props) {
  const entries = state.transcript;
  return (
    <Panel
      title="transcript"
      meta={<span className="bench__panel-meta">{entries.length} entries</span>}
    >
      {entries.length === 0 ? (
        <Empty>no entries yet</Empty>
      ) : (
        <div className="bench__transcript">
          {entries.map((e, i) => (
            <TranscriptEntryRow key={i} entry={e} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function TranscriptEntryRow({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'pick') {
    const picked = Array.isArray(entry.picked) ? entry.picked.join(', ') : entry.picked;
    const z = entry.latency_z;
    return (
      <div className="bench__transcript-entry bench__transcript-entry--pick">
        <div className="bench__transcript-q">
          Q{entry.pillar_idx}. {entry.question}
        </div>
        <div className="bench__transcript-pick">picked: {picked}</div>
        {entry.negative_space.length > 0 && (
          <div className="bench__transcript-pick bench__text-faint">
            skipped: {entry.negative_space.join(', ')}
          </div>
        )}
        <div className="bench__transcript-meta">
          {entry.latency_ms}ms
          {z !== undefined ? `  ·  z=${z >= 0 ? '+' : ''}${z.toFixed(1)}` : ''}
        </div>
      </div>
    );
  }
  if (entry.kind === 'assertion') {
    return (
      <div className="bench__transcript-entry bench__transcript-entry--assertion">
        <div className="bench__transcript-q">
          A{entry.assertion_idx}. {entry.statement}
        </div>
      </div>
    );
  }
  if (entry.kind === 'response') {
    const cls = entry.direction === 'warm'
      ? 'bench__transcript-entry bench__transcript-entry--response-warm'
      : 'bench__transcript-entry bench__transcript-entry--response-cold';
    return (
      <div className={cls}>
        <div className="bench__row bench__row--gap-2">
          <Pill variant={entry.direction === 'warm' ? 'warm' : 'cold'}>
            {entry.direction}
          </Pill>
          {entry.correction && (
            <span className="bench__text-mono bench__text-sm">"{entry.correction}"</span>
          )}
        </div>
        <div className="bench__transcript-meta">{entry.latency_ms}ms</div>
      </div>
    );
  }
  return null;
}
