// Bench panel — Verbatim log.
// Append-only indexed store of user free-text. The gold signal — the
// compiler weights corrections above warmth, above all else. Show
// every entry with its index + source + content.

import { Panel, Empty, Pill } from '../lib';
import type { EngineState } from '../../pipeline/antechamber';

type Props = { state: EngineState };

export function VerbatimPanel({ state }: Props) {
  const log = state.verbatim_log;
  const corrections = log.filter((v) => v.source === 'correction').length;
  return (
    <Panel
      title="verbatim"
      meta={
        <span className="bench__row bench__row--gap-2">
          <span className="bench__panel-meta">{log.length} entries</span>
          {corrections > 0 && <Pill variant="warm">{corrections} correction{corrections === 1 ? '' : 's'}</Pill>}
        </span>
      }
    >
      {log.length === 0 ? (
        <Empty>no verbatim text yet</Empty>
      ) : (
        <div className="bench__stack bench__stack--gap-2">
          {log.map((v) => (
            <div
              key={v.index}
              className="bench__row bench__row--gap-3"
              style={{ alignItems: 'baseline' }}
            >
              <span className="bench__text-faint bench__text-mono" style={{ minWidth: 28 }}>
                [{v.index}]
              </span>
              <Pill variant={v.source === 'correction' ? 'warm' : 'default'}>{v.source}</Pill>
              <span className="bench__text-mono bench__text-sm bench__text-faint">T{v.turn}</span>
              <span style={{ flex: 1 }}>{v.text}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
