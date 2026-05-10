import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { useSpeechInput } from './dialogue/useSpeechInput';
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
};

type Status =
  | { kind: 'opening' }
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'finalizing' }
  | { kind: 'error'; message: string; retry?: () => void };

export function Interview({ apiKey, base, onFinalized, onCancel }: Props) {
  // Restore in-flight interview from storage if present, else seed a new one.
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
  const clientRef = useRef(createClaudeClient(apiKey));
  const ranOpenRef = useRef(false);
  const speech = useSpeechInput((finalText) => {
    setDraft((prev) => (prev ? `${prev} ${finalText}` : finalText));
  });

  // Persist state changes to active session.
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

  // Kick off opening turn if needed.
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

  // Once finalizing, run finalize and forward to the next phase.
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

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || status.kind !== 'idle' || state.closed) return;
    setDraft('');
    setStatus({ kind: 'thinking' });
    try {
      const next = await interviewTurn(clientRef.current, state, trimmed);
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

  return (
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
        <form
          className="interview__form"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <input
            className="text-input"
            placeholder={
              speech.listening
                ? speech.interim || 'listening…'
                : inputDisabled ? '' : 'speak…'
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={inputDisabled}
            autoCapitalize="sentences"
            autoFocus
          />
          {speech.supported && (
            <button
              type="button"
              className={`btn btn--ghost mic-btn ${speech.listening ? 'mic-btn--on' : ''}`}
              onClick={() => speech.listening ? speech.stop() : speech.start()}
              disabled={inputDisabled}
              title={speech.listening ? 'stop recording' : 'voice input'}
              aria-label={speech.listening ? 'stop recording' : 'voice input'}
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
      )}
      {speech.error && (
        <div className="interview__voice-error">{speech.error}</div>
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
        <button className="btn btn--quiet" onClick={onCancel}>quit to menu</button>
      </div>
    </div>
  );
}
