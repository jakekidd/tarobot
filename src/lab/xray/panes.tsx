// The live panes: the table (center), the cognition column (piles, one
// panel per agent, streams while in flight), and the behavior column
// (driver, persona, economy, cassandra, frame).

import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Kv, Panel, Pill, Row, Stack, Stream } from '../lib';
import type {
  AgentName,
  CallRecord,
  EnsembleSnapshot,
  PileItem,
} from '../../pipeline/ensemble';

// ------------------------------------------------------------ shared

function latestCall(calls: CallRecord[], agent: AgentName): CallRecord | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].agent === agent) return calls[i];
  }
  return null;
}

function AgentMeta({ call }: { call: CallRecord | null }) {
  if (!call) return <Pill>idle</Pill>;
  if (call.error) return <Pill variant="hot">error</Pill>;
  if (call.endedAt === undefined) return <Pill variant="warm">running</Pill>;
  return <Pill variant="good">{`${call.endedAt - call.startedAt}ms`}</Pill>;
}

function AgentPanel({
  agent,
  title,
  calls,
  onInspect,
  children,
}: {
  agent: AgentName;
  title: string;
  calls: CallRecord[];
  onInspect: (id: string) => void;
  children: React.ReactNode;
}) {
  const call = latestCall(calls, agent);
  const inFlight = call !== null && call.endedAt === undefined && !call.error;
  return (
    <Panel title={title} meta={<AgentMeta call={call} />}>
      <Stack gap={2}>
        {inFlight && <Stream text={call.streamed} emptyHint="(waiting for first token)" maxHeight={140} />}
        {children}
        {call && (
          <Row end>
            <Button variant="ghost" onClick={() => onInspect(call.id)}>
              inspect last call
            </Button>
          </Row>
        )}
      </Stack>
    </Panel>
  );
}

function AnchorChip<P>({ item }: { item: PileItem<P> }) {
  return (
    <span className="xray__anchor">
      t{item.anchor.turn}
      {item.refreshes ? ' ↻' : ''}
    </span>
  );
}

// ------------------------------------------------------------ cognition

export function CognitionColumn({
  snap,
  calls,
  onInspect,
}: {
  snap: EnsembleSnapshot;
  calls: CallRecord[];
  onInspect: (id: string) => void;
}) {
  const { piles } = snap;
  return (
    <Stack gap={3}>
      <AgentPanel agent="interpreter" title={`reads · ${piles.reads.length}`} calls={calls} onInspect={onInspect}>
        {piles.reads.length === 0 && <Empty>no reads filed yet</Empty>}
        {piles.reads.slice(-8).map((item) => (
          <div key={item.id} className="xray__item">
            <AnchorChip item={item} />
            <Pill variant={item.payload.cue === 'none' ? 'default' : 'warm'}>cue: {item.payload.cue}</Pill>{' '}
            {item.payload.frame_stale && <Pill variant="warn">frame stale</Pill>}
            <div>{item.payload.expressing}</div>
            {item.payload.thoughts.map((t, i) => (
              <div key={i} className="xray__quote">“{t}”</div>
            ))}
            {item.payload.feelings.map((f, i) => (
              <div key={`f-${i}`}>
                {f.emotion}
                {f.toward ? ` → ${f.toward}` : ''} <span className="xray__anchor">({f.because})</span>
              </div>
            ))}
            {item.payload.behavior && <div className="xray__anchor">heading: {item.payload.behavior}</div>}
          </div>
        ))}
      </AgentPanel>

      <AgentPanel agent="psychic" title={`thoughts · ${piles.thoughts.length}`} calls={calls} onInspect={onInspect}>
        {piles.thoughts.length === 0 && <Empty>no guesses yet</Empty>}
        {piles.thoughts.slice(-8).map((item) => (
          <div key={item.id} className="xray__item">
            <AnchorChip item={item} />
            <span className="xray__quote">“{item.payload.thought}”</span>{' '}
            <Pill variant={item.payload.confidence === 3 ? 'hot' : item.payload.confidence === 2 ? 'warm' : 'cold'}>
              c{item.payload.confidence}
            </Pill>
          </div>
        ))}
      </AgentPanel>

      <AgentPanel agent="detective" title={`questions · ${piles.questions.length}`} calls={calls} onInspect={onInspect}>
        {piles.questions.length === 0 && <Empty>no questions yet</Empty>}
        {piles.questions.slice(-8).map((item) => (
          <div key={item.id} className="xray__item">
            <AnchorChip item={item} />
            <Pill variant={item.payload.status === 'answered' ? 'good' : 'default'}>{item.payload.status}</Pill>{' '}
            {item.payload.question}
            {item.payload.answer && <div className="xray__anchor">→ {item.payload.answer}</div>}
          </div>
        ))}
      </AgentPanel>

      <AgentPanel agent="beholder" title={`facts ledger · ${piles.facts.length}`} calls={calls} onInspect={onInspect}>
        {piles.facts.length === 0 && <Empty>ledger empty</Empty>}
        {piles.facts.map((item) => (
          <div key={item.id} className="xray__item">
            <Pill>{item.payload.kind}</Pill> <strong>{item.payload.label}</strong> — {item.payload.note}
          </div>
        ))}
      </AgentPanel>

      <AgentPanel agent="joker" title={`bits · ${piles.bits.length}`} calls={calls} onInspect={onInspect}>
        {piles.bits.length === 0 && <Empty>nothing funny yet</Empty>}
        {piles.bits.slice(-4).map((item) => (
          <div key={item.id} className="xray__item">
            <AnchorChip item={item} />
            {item.payload.setup}
            <div className="xray__anchor">when: {item.payload.play_when}</div>
          </div>
        ))}
      </AgentPanel>

      <AgentPanel agent="cassandra" title={`predictions · ${piles.predictions.length}`} calls={calls} onInspect={onInspect}>
        {piles.predictions.length === 0 && <Empty>no predictions yet</Empty>}
        {piles.predictions.slice(-6).map((item) => (
          <div key={item.id} className="xray__item">
            <AnchorChip item={item} />
            {item.payload.verdict && (
              <Pill
                variant={
                  item.payload.verdict === 'hit'
                    ? 'good'
                    : item.payload.verdict === 'graze'
                      ? 'warm'
                      : item.payload.verdict === 'miss'
                        ? 'hot'
                        : 'default'
                }
              >
                {item.payload.verdict}
              </Pill>
            )}{' '}
            {item.payload.gist}
            {item.payload.opening && <div className="xray__quote">opens: “{item.payload.opening}”</div>}
          </div>
        ))}
      </AgentPanel>
    </Stack>
  );
}

// ------------------------------------------------------------ the table

export function TablePane({
  snap,
  onSend,
  onSilence,
  onFlip,
  autoSilence,
  onAutoSilence,
}: {
  snap: EnsembleSnapshot;
  onSend: (text: string) => void;
  onSilence: () => void;
  onFlip: (slot: 1 | 2 | 3 | 4) => void;
  autoSilence: boolean;
  onAutoSilence: (on: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap.scroll.length]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="xray__table">
      <Row gap={2} wrap>
        <Pill variant={snap.phase === 'live' ? 'good' : 'default'}>{snap.phase}</Pill>
        {snap.busy && <Pill variant="warm">behavior: {snap.busy}…</Pill>}
        {snap.fanInFlight && <Pill variant="cold">cognition: fan running</Pill>}
        {snap.attentionInFlight && <Pill variant="cold">attention: reframing</Pill>}
        {snap.stallDebt && <Pill variant="warn">stall debt: {snap.stallDebt.kind}</Pill>}
        {snap.error && <Pill variant="hot">error</Pill>}
      </Row>
      <div className="xray__scrollview" ref={viewRef}>
        {snap.scroll.map((e, i) =>
          e.kind === 'beat' ? (
            <div key={i} className={`xray__beat xray__beat--${e.speaker}`}>
              <div className="xray__beat-speaker">{e.speaker}</div>
              <div className="xray__beat-text">
                {e.text}
                {e.truncated ? ' —' : ''}
              </div>
            </div>
          ) : (
            <div key={i} className="xray__ev">
              ⟨{e.ev}
              {e.slot !== undefined ? ` ${e.slot}` : ''}⟩
            </div>
          ),
        )}
      </div>
      <div className="xray__composer">
        {snap.mode === 'session' && (
          <Row gap={2}>
            {([1, 2, 3, 4] as const).map((slot) => (
              <Button
                key={slot}
                variant={snap.flipped.includes(slot) ? 'ghost' : 'default'}
                disabled={snap.flipped.includes(slot) || snap.phase !== 'live'}
                onClick={() => onFlip(slot)}
              >
                flip {slot}
              </Button>
            ))}
          </Row>
        )}
        <textarea
          className="xray__input"
          placeholder="speak as the visitor… (enter to send)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={snap.phase !== 'live'}
        />
        <Row between>
          <Row gap={2}>
            <Button onClick={onSilence} disabled={snap.phase !== 'live' || snap.busy !== null}>
              tick silence
            </Button>
            <label className="xray__config-row">
              <input
                type="checkbox"
                checked={autoSilence}
                onChange={(e) => onAutoSilence(e.target.checked)}
              />
              <span>auto</span>
            </label>
          </Row>
          <Button variant="primary" onClick={send} disabled={snap.phase !== 'live'}>
            send
          </Button>
        </Row>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ behavior

export function BehaviorColumn({
  snap,
  calls,
  onInspect,
}: {
  snap: EnsembleSnapshot;
  calls: CallRecord[];
  onInspect: (id: string) => void;
}) {
  const [frameV, setFrameV] = useState<number | null>(null);
  const intent = snap.lastIntent;
  const shownFrame =
    frameV !== null ? (snap.frames.find((f) => f.v === frameV) ?? snap.frame) : snap.frame;

  return (
    <Stack gap={3}>
      <AgentPanel agent="driver" title="driver" calls={calls} onInspect={onInspect}>
        {intent ? (
          <Kv
            rows={[
              {
                key: 'move',
                value: (
                  <>
                    <Pill variant={intent.move === 'stall' ? 'warn' : 'accent'}>{intent.move}</Pill>
                    {intent.canned && <Pill variant="hot">canned</Pill>}
                    {intent.stall_kind && <Pill>{intent.stall_kind}</Pill>}
                  </>
                ),
              },
              { key: 'thread', value: intent.thread },
              { key: 'accomplish', value: intent.accomplish },
              ...(intent.ammo ? [{ key: 'ammo', value: `“${intent.ammo}”` }] : []),
              { key: 'size', value: `~${intent.approx_words} words` },
              { key: 'note', value: intent.note },
            ]}
          />
        ) : (
          <Empty>no intent yet</Empty>
        )}
      </AgentPanel>

      <AgentPanel agent="persona" title="persona — the wildcard" calls={calls} onInspect={onInspect}>
        <Empty>her lines land on the table; raw stream shows here while she speaks</Empty>
      </AgentPanel>

      <Panel
        title="economy"
        meta={snap.economy.carry ? <Pill variant="warn">carrying</Pill> : <Pill variant="good">fed</Pill>}
      >
        <Kv
          rows={[
            { key: 'budget', value: `${snap.economy.budget} / ${snap.constants.WORD_MAX}` },
            { key: 'visitor share', value: snap.economy.ratio.toFixed(2) },
            {
              key: 'stall',
              value: snap.stallDebt
                ? `debt: ${snap.stallDebt.accomplish} (${snap.stallDebt.kind})`
                : 'clear',
            },
          ]}
        />
      </Panel>

      <Panel
        title="cassandra scoreboard"
        meta={`${snap.cassandra.hit}h ${snap.cassandra.graze}g ${snap.cassandra.miss}m`}
      >
        <Kv
          rows={[
            { key: 'hit', value: String(snap.cassandra.hit) },
            { key: 'graze', value: String(snap.cassandra.graze) },
            { key: 'miss', value: String(snap.cassandra.miss) },
            {
              key: 'rate',
              value: (() => {
                const total = snap.cassandra.hit + snap.cassandra.graze + snap.cassandra.miss;
                return total === 0
                  ? '—'
                  : `${Math.round(((snap.cassandra.hit + snap.cassandra.graze * 0.5) / total) * 100)}%`;
              })(),
            },
          ]}
        />
      </Panel>

      <AgentPanel agent="attention" title={`frame · v${snap.frame.v}`} calls={calls} onInspect={onInspect}>
        <Row gap={1} wrap>
          {snap.frames.map((f) => (
            <Button
              key={f.v}
              variant={shownFrame.v === f.v ? 'primary' : 'ghost'}
              onClick={() => setFrameV(f.v === snap.frame.v ? null : f.v)}
            >
              v{f.v}
            </Button>
          ))}
        </Row>
        <div className="xray__frame-md">{shownFrame.md}</div>
        <div className="xray__anchor">trigger: {shownFrame.trigger}</div>
      </AgentPanel>
    </Stack>
  );
}
