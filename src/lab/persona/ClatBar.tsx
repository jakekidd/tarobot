// clat's console — the bottom chat strip.
//
// Jade complains here ("she's too warm", "sample 4 sounds like an
// assistant"); clat (Opus) replies in character and, when warranted,
// rewrites the working draft. When he edits, the turn is flagged so she
// knows to check CHANGES and commit. Presentational — the parent owns the
// history and the askClat call (it has to apply the rewrite).

import { useEffect, useRef } from 'react';
import type { ClatTurn } from './clat';

type Props = {
  history: ClatTurn[];
  thinking: boolean;
  onSend: (message: string) => void;
};

export function ClatBar({ history, thinking, onSend }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, thinking]);

  function send() {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || thinking) return;
    el.value = '';
    onSend(text);
  }

  return (
    <div className="pst-clat">
      <div className="pst-clat__head">
        <span className="pst-clat__name">clat</span>
        <span className="pst-clat__hint">{thinking ? 'thinking…' : 'your sassy prompt familiar'}</span>
      </div>
      <div className="pst-clat__log" ref={logRef}>
        {history.length === 0 && !thinking && (
          <div className="pst-clat__empty">tell me what's wrong with her. i'll fix the prompt — you review the diff.</div>
        )}
        {history.map((t, i) => (
          <div key={i} className={`pst-clat__turn pst-clat__turn--${t.role}`}>
            <span className="pst-clat__who">{t.role}</span>
            <span className="pst-clat__text">{t.text}</span>
            {t.edited && <span className="pst-clat__edited" title="check the CHANGES view">✎ rewrote the prompt</span>}
          </div>
        ))}
        {thinking && <div className="pst-clat__turn pst-clat__turn--clat"><span className="pst-clat__who">clat</span><span className="pst-clat__text pst-clat__text--dim">…</span></div>}
      </div>
      <div className="pst-clat__compose">
        <textarea
          ref={inputRef}
          className="pst-clat__input"
          placeholder="complain to clat…  (⌘/ctrl + enter)"
          spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
        />
        <button type="button" className="pst-clat__send" onClick={send} disabled={thinking}>send</button>
      </div>
    </div>
  );
}
