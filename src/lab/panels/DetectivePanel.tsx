// Bench panel — Detective.
// Current hypothesis list (re-listed each pass; persistence = vote)
// + the accumulated thinking transcript across calls.

import { Panel, Empty, Stream, Stack, Pill } from '../lib';
import type { EngineState } from '../../pipeline/survey';

type Props = { state: EngineState };

export function DetectivePanel({ state }: Props) {
  const hyps = state.hypotheses;
  const thinking = state.detective_thinking;
  return (
    <Panel
      title="detective"
      meta={<span className="bench__panel-meta">{hyps.length} hypothesis{hyps.length === 1 ? '' : 'es'}</span>}
    >
      <Stack gap={3}>
        <div>
          <div className="bench__field-label" style={{ marginBottom: 6 }}>hypotheses</div>
          {hyps.length === 0 ? (
            <Empty>none yet — detective fires after the last pillar</Empty>
          ) : (
            <Stack gap={1}>
              {hyps.map((h, i) => (
                <div key={i} className="bench__row bench__row--gap-2" style={{ alignItems: 'baseline' }}>
                  <Pill>h{i + 1}</Pill>
                  <span style={{ flex: 1 }}>{h}</span>
                </div>
              ))}
            </Stack>
          )}
        </div>
        <div>
          <div className="bench__field-label" style={{ marginBottom: 6 }}>thinking trace</div>
          <Stream
            text={thinking}
            emptyHint="(detective hasn't fired yet)"
            maxHeight={260}
          />
        </div>
      </Stack>
    </Panel>
  );
}
