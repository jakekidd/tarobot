// Bench view — Run.
//
// The live session inspector. Assembles:
//   - top-of-screen interactive question form (drives the engine)
//   - all 7 state panels (stacked, 2-col on wide)
//
// Bench's killer view. Everything you'd want to see while iterating
// on a prompt, an agent, or the pipeline shape — visible at once,
// updates in real-time.

import { useState } from 'react';
import { useEngine } from '../useEngine';
import { Button, Pill, Row, Stack } from '../lib';
import { ChoicePick } from '../inputs/ChoicePick';
import { TextEntry } from '../inputs/TextEntry';
import { DateEntry } from '../inputs/DateEntry';
import { WarmCold } from '../inputs/WarmCold';
import { RelPickEntry } from '../inputs/RelPickEntry';
import { PhasePanel } from '../panels/PhasePanel';
import { TranscriptPanel } from '../panels/TranscriptPanel';
import { VerbatimPanel } from '../panels/VerbatimPanel';
import { WeaverPanel } from '../panels/WeaverPanel';
import { DetectivePanel } from '../panels/DetectivePanel';
import { AgentPanel } from '../panels/AgentPanel';
import { DilemmaPanel } from '../panels/DilemmaPanel';
import { RELATIONSHIP_STATUS_OPTIONS } from '../../pipeline/survey/types';

type Props = {
  apiKey: string;
};

export function Run({ apiKey }: Props) {
  const [resetKey, setResetKey] = useState(0);
  const hook = useEngine({ apiKey, resetKey });
  const { state } = hook;

  function exportSession() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bench-session-${state.session_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Stack gap={4}>
      <RunControls
        sessionId={state.session_id}
        thinking={state.thinking}
        onReset={() => setResetKey((k) => k + 1)}
        onExport={exportSession}
      />

      <InteractiveCard hook={hook} />

      <div className="bench__grid-2">
        <Stack gap={4}>
          <PhasePanel state={state} />
          <TranscriptPanel state={state} />
          <VerbatimPanel state={state} />
          <DilemmaPanel state={state} />
        </Stack>
        <Stack gap={4}>
          <WeaverPanel state={state} />
          <DetectivePanel state={state} />
          <AgentPanel />
        </Stack>
      </div>
    </Stack>
  );
}

// ─── Top control bar ───────────────────────────────────────

type ControlsProps = {
  sessionId: string;
  thinking: boolean;
  onReset: () => void;
  onExport: () => void;
};

function RunControls({ sessionId, thinking, onReset, onExport }: ControlsProps) {
  return (
    <div className="bench__run-controls">
      <div className="bench__run-status">
        <span className="bench__text-mono bench__text-sm bench__text-faint">{sessionId}</span>
        {thinking && <Pill variant="warn">thinking</Pill>}
      </div>
      <Row gap={2}>
        <Button onClick={onExport} variant="ghost">export session</Button>
        <Button onClick={onReset} variant="danger">start fresh</Button>
      </Row>
    </div>
  );
}

// ─── Interactive question card ─────────────────────────────

type InteractiveProps = {
  hook: ReturnType<typeof useEngine>;
};

function InteractiveCard({ hook }: InteractiveProps) {
  const { state, currentQuestion, submitAnswer, submitIntention, seer } = hook;

  // Stage routing: awaiting_intention → show intent submit; reading_ready → done; closed → done.
  if (state.stage === 'awaiting_intention') {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow">intent</div>
        <div className="bench__qcard-q">what do you want to ask?</div>
        <TextEntry
          placeholder="a question, or a statement of intention"
          submitLabel="submit intention"
          onSubmit={(t) => submitIntention(t)}
        />
      </div>
    );
  }

  if (state.stage === 'compiling' || state.stage === 'finalizing') {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow">{state.stage}</div>
        <div className="bench__qcard-q bench__text-muted">
          {state.stage === 'compiling'
            ? 'compiler is sifting the candidates...'
            : 'finalizing session...'}
        </div>
      </div>
    );
  }

  if (state.stage === 'reading_ready') {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow">ready</div>
        <div className="bench__qcard-q">
          dilemma resolved {seer ? '· seer constructed' : ''}
        </div>
        <div className="bench__text-muted">
          The reading layer is not surfaced inside Bench (yet). Use the main app
          to actually play the reading; Bench's job ends here. Inspect the
          Dilemma panel below to see what shipped to the seer.
        </div>
      </div>
    );
  }

  if (state.stage === 'null_landing') {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow bench__text-accent">null landing</div>
        <div className="bench__qcard-q">
          no dilemma resolved. session ended.
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="bench__qcard">
        <div className="bench__qcard-eyebrow">idle</div>
        <div className="bench__qcard-q bench__text-muted">
          waiting on the next question...
        </div>
      </div>
    );
  }

  return (
    <div className="bench__qcard">
      <QuestionHeader q={currentQuestion} />
      <QuestionInput q={currentQuestion} onSubmit={submitAnswer} selfName={state.profile.name} />
    </div>
  );
}

type Q = ReturnType<typeof useEngine>['currentQuestion'] & {};

function QuestionHeader({ q }: { q: NonNullable<Q> }) {
  return (
    <>
      <div className="bench__qcard-eyebrow">
        {q.format}  ·  {q.node_id}
      </div>
      {q.format === 'assertion' && q.instrument?.kind === 'assertion' ? (
        <div className="bench__assertion-text">{q.instrument.statement}</div>
      ) : (
        <div className="bench__qcard-q">{q.text}</div>
      )}
    </>
  );
}

function QuestionInput({
  q,
  onSubmit,
  selfName,
}: {
  q: NonNullable<Q>;
  onSubmit: (a: string | string[]) => Promise<void>;
  selfName: string;
}) {
  const submit = (v: string | string[]) => { void onSubmit(v); };

  if (q.format === 'assertion') {
    return <WarmCold onPick={submit} />;
  }
  if (q.format === 'choice' || q.format === 'matrix') {
    return <ChoicePick options={q.options} onPick={submit} />;
  }
  if (q.format === 'binary') {
    return <ChoicePick options={['yes', 'no', 'sometimes']} onPick={submit} />;
  }
  if (q.format === 'date') {
    return <DateEntry onSubmit={submit} />;
  }
  if (q.format === 'text') {
    return <TextEntry onSubmit={submit} />;
  }
  if (q.format === 'intent') {
    return (
      <TextEntry
        placeholder="your question for the cards"
        allowEmpty
        submitLabel="submit"
        onSubmit={submit}
      />
    );
  }
  if (q.format === 'relationship_status') {
    return <ChoicePick options={RELATIONSHIP_STATUS_OPTIONS} onPick={submit} />;
  }
  if (q.format === 'relationship_pick') {
    return <RelPickEntry selfName={selfName} onSubmit={submit} />;
  }
  return (
    <div className="bench__text-faint">
      unsupported format in bench: {q.format}
    </div>
  );
}
