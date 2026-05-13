import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { MultipleChoice } from './choices/MultipleChoice';
import { Spinner } from './Spinner';
import { DebugPanel } from './DebugPanel';
import {
  bootEngine,
  createClaudeClient,
  pickOpener,
  userPick,
  type EngineState,
  type Profile,
  type Question,
  type Survey,
} from '../pipeline';

type Props = {
  apiKey: string;
  survey: Survey;
  profile: Profile;
  openers: Question[];
  onCancel: () => void;
  debugOpen: boolean;
  onCloseDebug: () => void;
};

type Status =
  | { kind: 'booting' }
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'error'; message: string; retry?: () => void };

export function Tent({
  apiKey, survey, profile, openers,
  onCancel, debugOpen, onCloseDebug,
}: Props) {
  const clientRef = useRef(createClaudeClient(apiKey));

  // Pick the opener once at mount via lazy initializer (no setState in effect).
  const [pickedOpener] = useState<Question | null>(() => pickOpener(openers));
  const [state, setState] = useState<EngineState | null>(null);
  const [status, setStatus] = useState<Status>(() =>
    pickedOpener ? { kind: 'booting' } : { kind: 'error', message: 'no openers from compiler' },
  );
  const [speaking, setSpeaking] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const bootedRef = useRef(false);

  // Boot on mount: fire the first persona call using the picked opener.
  useEffect(() => {
    if (bootedRef.current || !pickedOpener) return;
    bootedRef.current = true;
    let cancelled = false;

    const { state: initial, firstSpeech } = bootEngine(
      clientRef.current, survey, profile, pickedOpener,
    );
    setState(initial);

    firstSpeech
      .then(({ state: bootedState }) => {
        if (cancelled) return;
        setState(bootedState);
        setStatus({ kind: 'idle' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setStatus({ kind: 'error', message: msg });
      });

    return () => { cancelled = true; };
  }, [survey, profile, pickedOpener]);

  async function pick(idx: number) {
    if (!state || state.current_question === null) return;
    if (status.kind !== 'idle') return;
    setStatus({ kind: 'thinking' });
    try {
      const next = await userPick(clientRef.current, state, idx);
      setState(next);
      setStatus(next.closed ? { kind: 'idle' } : { kind: 'idle' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setStatus({
        kind: 'error',
        message: msg,
        retry: () => setStatus({ kind: 'idle' }),
      });
    }
  }

  function copyTranscript() {
    if (!state) return;
    const lines = [
      `# tarobot tent transcript`,
      `started: ${new Date(state.survey.started_at).toISOString()}`,
      `turns: ${state.turn_count}`,
      ``,
      `## brief`,
      state.profile.brief,
      ``,
      `## transcript`,
      ...state.transcript.flatMap((line) => [
        `**${line.speaker}**: ${line.content}`,
        ...line.thoughts.map((t) => `> ${t}`),
      ]),
      ``,
      `## profile`,
      '```json',
      JSON.stringify(state.profile, null, 2),
      '```',
      ``,
      `## queue`,
      '```json',
      JSON.stringify(state.question_queue, null, 2),
      '```',
    ].join('\n');

    navigator.clipboard.writeText(lines).then(
      () => {
        setCopyToast('copied');
        window.setTimeout(() => setCopyToast(null), 1800);
      },
      () => setCopyToast('copy failed'),
    );
  }

  if (!state) {
    return (
      <div className="screen screen--tent">
        <Spinner label="entering" />
      </div>
    );
  }

  const lastPersona = [...state.transcript].reverse().find((l) => l.speaker === 'persona');
  // tarobot is a lowercase universe — force the register at render time
  // regardless of what the persona happens to output.
  const speech = (lastPersona?.content ?? '…').toLowerCase();
  const q = state.current_question;
  const inputDisabled = status.kind !== 'idle' || !q;

  return (
    <div className={`interview-shell ${debugOpen ? 'interview-shell--with-debug' : ''}`}>
      {debugOpen && <DebugPanel state={state} onClose={onCloseDebug} />}

      <div className="interview-main">
        <div className="screen screen--tent">
          <Reader
            isSpeaking={speaking}
            mood={status.kind === 'thinking' ? 'thinking' : 'neutral'}
          />

          <Dialogue
            key={`turn-${state.turn_count}-${state.transcript.length}`}
            text={speech}
            onTypingChange={setSpeaking}
          />

          <div className="ui-frame">
            <div className="ui-frame__choices">
              {status.kind === 'thinking' ? (
                <Spinner label="thinking" />
              ) : status.kind === 'booting' ? (
                <Spinner label="entering" />
              ) : status.kind === 'error' ? (
                <div className="screen__error">
                  <div>{status.message}</div>
                  {status.retry && (
                    <button className="btn btn--chrome" onClick={status.retry}>
                      try again
                    </button>
                  )}
                </div>
              ) : q ? (
                <MultipleChoice
                  suggestions={q.options}
                  disabled={inputDisabled}
                  onPick={(opt) => {
                    const idx = q.options.indexOf(opt);
                    if (idx >= 0) void pick(idx);
                  }}
                />
              ) : (
                <div className="screen__lede">no question queued.</div>
              )}
            </div>

            <div className="ui-frame__meta">
              <span>turn {state.turn_count}</span>
              <div className="ui-frame__meta-actions">
                <button className="btn btn--quiet" onClick={copyTranscript}>
                  {copyToast ?? 'copy transcript'}
                </button>
                <button className="btn btn--quiet" onClick={onCancel}>quit</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
