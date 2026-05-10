import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { DebugPanel } from './DebugPanel';
import { MultipleChoice } from './choices/MultipleChoice';
import { Spinner } from './Spinner';
import {
  createClaudeClient,
  finalizeProfile,
  interviewTurn,
  openInterview,
  startInterview,
} from '../pipeline';
import type {
  BaseProfile,
  EnrichedProfile,
  InterviewState,
} from '../pipeline';
import { loadActive, saveActive } from '../storage';

type Props = {
  apiKey: string;
  base: BaseProfile;
  onFinalized: (profile: EnrichedProfile) => void;
  onCancel: () => void;
  debugOpen: boolean;
  onCloseDebug: () => void;
};

type Status =
  | { kind: 'opening' }
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'finalizing' }
  | { kind: 'error'; message: string; retry?: () => void };

export function Interview({ apiKey, base, onFinalized, onCancel, debugOpen, onCloseDebug }: Props) {
  const [state, setState] = useState<InterviewState>(() => {
    const active = loadActive();
    if (
      active?.interview &&
      active.base_profile?.survey?.name === base.survey.name
    ) {
      return active.interview;
    }
    return startInterview(base);
  });

  const [status, setStatus] = useState<Status>(() =>
    state.history.length === 0 ? { kind: 'opening' } : { kind: 'idle' },
  );
  const [draft, setDraft] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const clientRef = useRef(createClaudeClient(apiKey));
  const ranOpenRef = useRef(false);

  useEffect(() => {
    const active = loadActive();
    if (!active) return;
    saveActive({
      ...active,
      base_profile: base,
      interview: state,
      history: state.history,
      phase: state.closed ? 'finalizing' : 'interview',
    });
  }, [state, base]);

  useEffect(() => {
    if (state.history.length > 0 || ranOpenRef.current) return;
    ranOpenRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const next = await openInterview(clientRef.current, state);
        if (cancelled) return;
        setState(next);
        setStatus(next.closed ? { kind: 'finalizing' } : { kind: 'idle' });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setStatus({
          kind: 'error',
          message: msg,
          retry: () => {
            ranOpenRef.current = false;
            setStatus({ kind: 'opening' });
          },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [state, status.kind === 'opening']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status.kind !== 'finalizing') return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await finalizeProfile(clientRef.current, state);
        if (cancelled) return;
        onFinalized(profile);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setStatus({
          kind: 'error',
          message: msg,
          retry: () => setStatus({ kind: 'finalizing' }),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [status.kind, state, onFinalized]);

  async function sendMessage(text: string) {
    if (!text.trim() || status.kind !== 'idle' || state.closed) return;
    setStatus({ kind: 'thinking' });
    try {
      const next = await interviewTurn(clientRef.current, state, text.trim());
      setState(next);
      setStatus(next.closed ? { kind: 'finalizing' } : { kind: 'idle' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setStatus({
        kind: 'error',
        message: msg,
        retry: () => setStatus({ kind: 'idle' }),
      });
    }
  }

  async function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void sendMessage(text);
  }

  function copyTranscript() {
    const lines = [
      `# tarobot interview transcript`,
      `started: ${new Date(state.base_profile.started_at).toISOString()}`,
      `turns: ${state.turns_used}/${state.turns_used + state.turns_remaining}`,
      `closed: ${state.closed ? state.closing_reason ?? 'yes' : 'no'}`,
      ``,
      `## survey`,
      '```json',
      JSON.stringify(state.base_profile.survey, null, 2),
      '```',
      ``,
      `## conversation`,
      ...state.history.map((m) => `**${m.role}**: ${m.content}`),
      ``,
      `## last analysis`,
      state.last_analysis
        ? '```json\n' + JSON.stringify(state.last_analysis, null, 2) + '\n```'
        : '(none)',
      ``,
      `## negative space (running hypotheses)`,
      '```json',
      JSON.stringify(state.negative_space, null, 2),
      '```',
      ``,
      `## current candidates`,
      '```json',
      JSON.stringify(state.candidates, null, 2),
      '```',
      ``,
      `## disclosures`,
      '```json',
      JSON.stringify(state.partial_profile.disclosures ?? [], null, 2),
      '```',
      ``,
      `## hooks`,
      '```json',
      JSON.stringify(state.partial_profile.hooks ?? [], null, 2),
      '```',
      ``,
      `## patterns`,
      '```json',
      JSON.stringify(state.partial_profile.patterns ?? {}, null, 2),
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

  const lastAssistant =
    [...state.history].reverse().find((m) => m.role === 'assistant')?.content ?? '…';

  const inputDisabled =
    status.kind === 'thinking' ||
    status.kind === 'opening' ||
    status.kind === 'finalizing' ||
    status.kind === 'error' ||
    state.closed;

  const suggestions = state.suggested_answers ?? [];
  const isBinary = !!state.is_binary;

  const isWaiting = status.kind === 'thinking' || status.kind === 'opening' || status.kind === 'finalizing';
  const waitLabel =
    status.kind === 'opening' ? 'reaching for you'
    : status.kind === 'finalizing' ? 'reading what was said'
    : 'thinking';

  return (
    <div className={`interview-shell ${debugOpen ? 'interview-shell--with-debug' : ''}`}>
      {debugOpen && <DebugPanel state={state} onClose={onCloseDebug} />}

      <div className="interview-main">
        <div className="screen screen--interview">
          <Reader isSpeaking={speaking} mood={status.kind === 'thinking' ? 'thinking' : 'neutral'} />

          {/* Speech — pre-allocated, double-walled */}
          {status.kind !== 'opening' ? (
            <Dialogue
              key={`turn-${state.history.length}`}
              text={lastAssistant}
              onTypingChange={setSpeaking}
            />
          ) : (
            <div className="dialogue-stage dialogue-stage--placeholder">
              <Spinner label="reaching for you" />
            </div>
          )}

          {/* Static UI frame — every interactive element below speech lives here. */}
          <div className="ui-frame">
            <div className="ui-frame__choices">
              {status.kind === 'error' ? (
                <div className="screen__error">
                  <div>{status.message}</div>
                  {status.retry && (
                    <button className="btn btn--chrome" onClick={status.retry}>
                      try again
                    </button>
                  )}
                </div>
              ) : isWaiting ? (
                <div className="ui-frame__waiting">
                  <Spinner label={waitLabel} />
                </div>
              ) : (
                <MultipleChoice
                  suggestions={suggestions}
                  isBinary={isBinary}
                  disabled={inputDisabled}
                  onPick={(v) => sendMessage(v)}
                />
              )}
            </div>

            <form
              className="ui-frame__form"
              onSubmit={(e) => { e.preventDefault(); void sendDraft(); }}
            >
              <input
                className="text-input text-input--ghost"
                placeholder={inputDisabled ? '' : 'or type your own…'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={inputDisabled || state.closed}
                autoCapitalize="sentences"
              />
              <button
                type="submit"
                className="btn btn--chrome btn--send"
                disabled={inputDisabled || state.closed || draft.trim().length === 0}
              >
                send
              </button>
            </form>

            <div className="ui-frame__meta">
              <span>turn {state.turns_used}/{state.turns_used + state.turns_remaining}</span>
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
