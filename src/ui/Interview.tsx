import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { useSpeechInput } from './dialogue/useSpeechInput';
import { DebugPanel } from './DebugPanel';
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
  const speech = useSpeechInput((finalText) => {
    setDraft((prev) => (prev ? `${prev} ${finalText}` : finalText));
  });

  // Persist state changes.
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

  // Opening turn.
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

  // Finalize after close.
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
  const lastAssistantIdx = state.history.length - 1 -
    [...state.history].reverse().findIndex((m) => m.role === 'assistant');
  const olderHistory = state.history.slice(0, Math.max(0, lastAssistantIdx));

  const inputDisabled =
    status.kind === 'thinking' ||
    status.kind === 'opening' ||
    status.kind === 'finalizing' ||
    status.kind === 'error' ||
    state.closed;

  const showInput = !state.closed && status.kind !== 'finalizing';
  const suggestions = state.suggested_answers ?? [];

  return (
    <div className={`interview-shell ${debugOpen ? 'interview-shell--with-debug' : ''}`}>
      {debugOpen && (
        <DebugPanel state={state} onClose={onCloseDebug} />
      )}

      <div className="interview-main">
        <div className="screen screen--interview">
          <Reader isSpeaking={speaking} mood={status.kind === 'thinking' ? 'thinking' : 'neutral'} />

          <div className="interview__stage">
            {status.kind === 'opening' ? (
              <div className="interview__waiting">
                <span>tarobot is reaching for you…</span>
              </div>
            ) : (
              <Dialogue
                key={`turn-${state.history.length}`}
                text={lastAssistant}
                onTypingChange={setSpeaking}
              />
            )}

            {status.kind === 'thinking' && (
              <div className="interview__thinking">…thinking…</div>
            )}
            {status.kind === 'finalizing' && (
              <div className="interview__thinking">reading what was said…</div>
            )}
            {status.kind === 'error' && (
              <div className="screen__error">
                <div>{status.message}</div>
                {status.retry && (
                  <button className="btn btn--ghost" onClick={status.retry}>
                    try again
                  </button>
                )}
              </div>
            )}
          </div>

          {showInput && (
            <div className="interview__answers">
              {/* Reserved space for up to 6 suggestion rows. */}
              <ul className="suggestion-list" aria-label="suggested answers">
                {suggestions.map((opt, i) => (
                  <li key={`${i}-${opt}`}>
                    <button
                      className="suggestion-row"
                      disabled={inputDisabled}
                      onClick={() => sendMessage(opt)}
                    >
                      <span className="suggestion-row__bullet">›</span>
                      <span className="suggestion-row__text">{opt}</span>
                    </button>
                  </li>
                ))}
                {/* Placeholder rows to keep layout stable */}
                {Array.from({ length: Math.max(0, 6 - suggestions.length) }).map((_, i) => (
                  <li key={`pad-${i}`} aria-hidden className="suggestion-row suggestion-row--placeholder" />
                ))}
              </ul>

              {/* Always-visible text input + mic + send */}
              <form
                className="answer-form"
                onSubmit={(e) => { e.preventDefault(); void sendDraft(); }}
              >
                <input
                  className="text-input"
                  placeholder={
                    speech.listening
                      ? speech.interim || 'listening…'
                      : inputDisabled ? '' : 'or type your own…'
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={inputDisabled}
                  autoCapitalize="sentences"
                />
                {speech.supported && (
                  <button
                    type="button"
                    className={`btn btn--ghost mic-btn ${speech.listening ? 'mic-btn--on' : ''}`}
                    onClick={() => speech.listening ? speech.stop() : speech.start()}
                    disabled={inputDisabled}
                    title={speech.listening ? 'stop' : 'voice input'}
                    aria-label={speech.listening ? 'stop' : 'voice input'}
                  >
                    {speech.listening ? '■' : '🎙'}
                  </button>
                )}
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={inputDisabled || draft.trim().length === 0}
                >
                  send
                </button>
              </form>
              {speech.error && (
                <div className="interview__voice-error">{speech.error}</div>
              )}
            </div>
          )}

          {olderHistory.length > 0 && (
            <details className="interview__history">
              <summary>conversation so far ({olderHistory.length})</summary>
              <ul>
                {olderHistory.map((m, i) => (
                  <li key={i} className={`interview__turn interview__turn--${m.role}`}>
                    <span className="interview__role">{m.role === 'user' ? 'you' : 'tarobot'}</span>
                    <span className="interview__content">{m.content}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="interview__meta">
            <span>turn {state.turns_used}/{state.turns_used + state.turns_remaining}</span>
            <div className="interview__meta-actions">
              <button className="btn btn--quiet" onClick={copyTranscript}>
                {copyToast ?? 'copy transcript'}
              </button>
              <button className="btn btn--quiet" onClick={onCancel}>quit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
