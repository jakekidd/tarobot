// The live panes: the table (center), the cognition column (piles, one
// panel per agent, streams while in flight), and the behavior column
// (driver, persona, economy, cassandra, frame).

import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Kv, Panel, Pill, Row, Stack, Stream } from '../lib';
import {
  CHAT_STOPS,
  SESSION_STOPS,
  stopIndex,
  type AgentName,
  type CallRecord,
  type EnsembleSnapshot,
  type PersonaLine,
  type PileItem,
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

      <AgentPanel agent="beholder" title={`facts ledger · ${piles.facts.length}`} calls={calls} onInspect={onInspect}>
        {piles.facts.length === 0 && <Empty>ledger empty</Empty>}
        {piles.facts.map((item) => (
          <div key={item.id} className="xray__item">
            <Pill>{item.payload.kind}</Pill> <strong>{item.payload.label}</strong> — {item.payload.note}
          </div>
        ))}
      </AgentPanel>

    </Stack>
  );
}

// ---------------------------------------------------------- the train line

/** the overhead nav: every stop on the session's line, the current one
 *  lit, the next one flashing. stages are derived, never model-decided. */
function TrainLine({ snap }: { snap: EnsembleSnapshot }) {
  const stops = snap.mode === 'session' ? SESSION_STOPS : CHAT_STOPS;
  const here = stopIndex(snap.mode, snap.stage);
  const done = snap.phase === 'closed';
  return (
    <div className="xray__trainline">
      {stops.map((s, i) => {
        const cls = ['xray__stop'];
        if (i < here || (done && i <= here)) cls.push('xray__stop--past');
        else if (i === here) cls.push('xray__stop--here');
        else if (i === here + 1) cls.push('xray__stop--next');
        return (
          <div key={s.id} className={cls.join(' ')}>
            <span className="xray__stop-dot" />
            <span className="xray__stop-label">{s.label}</span>
          </div>
        );
      })}
    </div>
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
      <TrainLine snap={snap} />
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

/** the goldilocks pass, visible: the two takes she wrote to know where
 *  the floor and the cliff are, and the one she spoke. */
function PersonaTakes({ calls }: { calls: CallRecord[] }) {
  const call = latestCall(calls, 'persona');
  const out = call?.output as Partial<PersonaLine> | undefined;
  if (!out || typeof out.spoken !== 'string') {
    return <Empty>her spoken take lands on the table; the rejected takes show here</Empty>;
  }
  return (
    <div className="xray__takes">
      <div className="xray__take xray__take--rejected">
        <span className="xray__take-tag">too safe</span> “{out.too_safe}”
      </div>
      <div className="xray__take xray__take--rejected">
        <span className="xray__take-tag">too far</span> “{out.too_far}”
      </div>
      <div className="xray__take">
        <span className="xray__take-tag">spoken</span> “{out.spoken}”
      </div>
    </div>
  );
}

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
        <PersonaTakes calls={calls} />
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
