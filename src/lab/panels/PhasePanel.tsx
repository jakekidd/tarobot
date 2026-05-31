// Bench panel — Phase / stage / queue snapshot.
// The top-level orientation: where in the pipeline are we right now,
// what's queued, how many turns deep are we.

import { Panel, Pill, Kv } from '../lib';
import type { EngineState } from '../../pipeline/survey';

type Props = { state: EngineState };

export function PhasePanel({ state }: Props) {
  const openerCount = state.picks_log.filter((p) => isOpener(p.node_id)).length;
  const postOpenerCount = state.picks_log.length - openerCount;
  const stageVariant = stagePillVariant(state.stage);

  return (
    <Panel
      title="phase"
      meta={
        <span className="bench__row bench__row--gap-2">
          <Pill variant={stageVariant}>{state.stage}</Pill>
          <Pill>phase {state.phase}</Pill>
        </span>
      }
    >
      <Kv
        rows={[
          { key: 'session', value: <span className="bench__text-mono">{state.session_id}</span> },
          { key: 'stage', value: state.stage },
          { key: 'phase', value: state.phase },
          { key: 'picks total', value: state.picks_log.length },
          { key: 'opener picks', value: openerCount },
          { key: 'post-opener', value: postOpenerCount },
          { key: 'queue length', value: state.queue.length },
          { key: 'assertion queue', value: state.assertion_queue.length },
          { key: 'thinking', value: state.thinking ? <Pill variant="warn">yes</Pill> : 'no' },
          { key: 'closed', value: state.closed ? <Pill variant="hot">yes</Pill> : 'no' },
          { key: 'close reason', value: state.close_reason ?? '—' },
          { key: 'doc.v', value: state.doc.v },
        ]}
      />
    </Panel>
  );
}

function isOpener(nodeId: string): boolean {
  return nodeId === 'name' || nodeId === 'birthday' || nodeId === 'relationship' || nodeId === 'intent';
}

function stagePillVariant(stage: EngineState['stage']): 'default' | 'good' | 'warn' | 'accent' | 'hot' {
  if (stage === 'reading_ready') return 'good';
  if (stage === 'compiling' || stage === 'finalizing') return 'warn';
  if (stage === 'awaiting_intention') return 'accent';
  if (stage === 'null_landing') return 'hot';
  return 'default';
}
