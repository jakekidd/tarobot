// Bench panel — Dilemma.
// The compiler's structured output. Shows resolution path, label,
// fork branches, critical hypotheses, freeform regions. While the
// compiler is streaming, surfaces the live thinking trace.

import { useEffect, useState } from 'react';
import { Panel, Empty, Pill, Stack, Stream, Json } from '../lib';
import type { EngineState } from '../../pipeline/antechamber';
import { subscribeCompilerStream, type CompilerStreamEvent } from '../../debug/compilerStreamBus';

type Props = { state: EngineState };

export function DilemmaPanel({ state }: Props) {
  const d = state.dilemma;
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    return subscribeCompilerStream((event: CompilerStreamEvent) => {
      if (event.kind === 'start') {
        setStreaming(true);
        setStreamText('');
        return;
      }
      if (event.kind === 'thinking') {
        setStreamText((t) => t + event.chunk);
        return;
      }
      if (event.kind === 'end') {
        setStreaming(false);
        return;
      }
    });
  }, []);

  return (
    <Panel
      title="dilemma"
      meta={
        d ? (
          <span className="bench__row bench__row--gap-2">
            <Pill variant={d.null_landing ? 'hot' : 'good'}>
              {d.null_landing ? 'null-landing' : d.resolution_path}
            </Pill>
            {!d.null_landing && <Pill>{d.confidence}</Pill>}
          </span>
        ) : streaming ? (
          <Pill variant="warn">streaming</Pill>
        ) : (
          <span className="bench__panel-meta">not yet compiled</span>
        )
      }
    >
      {streaming && !d ? (
        <Stack gap={2}>
          <div className="bench__field-label">compiler thinking</div>
          <Stream text={streamText} emptyHint="(opening...)" maxHeight={400} />
        </Stack>
      ) : !d ? (
        <Empty>no dilemma yet — runs after intent is submitted</Empty>
      ) : (
        <Stack gap={4}>
          <div>
            <div className="bench__field-label" style={{ marginBottom: 6 }}>label</div>
            <div className="bench__text-mono bench__text-accent">{d.label}</div>
          </div>
          {!d.null_landing && (
            <>
              <div>
                <div className="bench__field-label" style={{ marginBottom: 6 }}>delta</div>
                <div>{d.delta_description}</div>
              </div>
              <div>
                <div className="bench__field-label" style={{ marginBottom: 6 }}>fork</div>
                <Stack gap={2}>
                  <div className="bench__stack bench__stack--gap-1">
                    <Pill>continue as you are</Pill>
                    <div>{d.fork.do_nothing_branch}</div>
                  </div>
                  <div className="bench__stack bench__stack--gap-1">
                    <Pill variant="accent">the alternative</Pill>
                    <div>{d.fork.alternative_branch}</div>
                  </div>
                </Stack>
              </div>
              <div className="bench__row bench__row--gap-2 bench__row--wrap">
                <Pill>{d.awareness}</Pill>
                {d.domain_tags.map((t) => (
                  <Pill key={t} variant="accent">{t}</Pill>
                ))}
              </div>
              {d.critical_hypotheses.length > 0 && (
                <div>
                  <div className="bench__field-label" style={{ marginBottom: 6 }}>
                    critical hypotheses
                  </div>
                  <Stack gap={2}>
                    {d.critical_hypotheses.map((h, i) => (
                      <div key={i} className="bench__candidate">
                        <div className="bench__row bench__row--gap-2" style={{ marginBottom: 6 }}>
                          <Pill variant={confVariant(h.confidence)}>{h.confidence}</Pill>
                        </div>
                        <div style={{ marginBottom: 4 }}>{h.claim}</div>
                        <div className="bench__text-faint bench__text-sm bench__text-mono">
                          {h.evidence}
                        </div>
                      </div>
                    ))}
                  </Stack>
                </div>
              )}
              {d.specifics.trim() && (
                <div>
                  <div className="bench__field-label" style={{ marginBottom: 6 }}>specifics</div>
                  <div className="bench__text-sm" style={{ whiteSpace: 'pre-wrap' }}>{d.specifics}</div>
                </div>
              )}
              {d.holding.trim() && (
                <div>
                  <div className="bench__field-label" style={{ marginBottom: 6 }}>holding</div>
                  <div className="bench__text-italic">{d.holding}</div>
                </div>
              )}
              {d.suspicions.trim() && (
                <div>
                  <div className="bench__field-label bench__text-faint" style={{ marginBottom: 6 }}>
                    suspicions — fenced
                  </div>
                  <div className="bench__text-sm bench__text-faint" style={{ whiteSpace: 'pre-wrap' }}>
                    {d.suspicions}
                  </div>
                </div>
              )}
            </>
          )}
          <details>
            <summary className="bench__text-faint bench__text-sm" style={{ cursor: 'pointer' }}>
              raw json
            </summary>
            <div style={{ marginTop: 8 }}>
              <Json value={d} maxHeight={300} />
            </div>
          </details>
        </Stack>
      )}
    </Panel>
  );
}

function confVariant(c: 'low' | 'medium' | 'high'): 'cold' | 'warn' | 'good' {
  if (c === 'high') return 'good';
  if (c === 'medium') return 'warn';
  return 'cold';
}
