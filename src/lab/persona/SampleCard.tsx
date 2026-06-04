// One sample card in the right rail.
//
// Shows the seeker's quote (the input) and the seer's response (the
// output) in two clearly different registers. On a re-run, the previous
// response stays faded above the new one — the behavioral delta, not just
// the latest text. Click the response (or "continue") to open it into a
// multi-turn thread. "clat" hands this exact exchange to the assistant.

import { useState } from 'react';
import type { Sample } from './samples';
import type { RunState } from './types';

type Props = {
  sample: Sample;
  run: RunState | undefined;
  busy: boolean;
  onRun: () => void;
  onOpenThread: () => void;
  onNudgeClat: () => void;
  onDelete: () => void;
  onEditQuote?: (quote: string) => void;
};

function approxTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 4));
}

export function SampleCard({
  sample, run, busy, onRun, onOpenThread, onNudgeClat, onDelete, onEditQuote,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sample.quote);

  const status = run?.status ?? 'idle';
  const showResponse = status === 'running' || status === 'done';
  const showPrev = !!run?.prev && run.prev !== run.text && status === 'done';

  return (
    <div className={`pst-card pst-card--${status}`}>
      <div className="pst-card__head">
        <span className="pst-card__tag">{sample.tag}</span>
        <div className="pst-card__head-actions">
          <button type="button" className="pst-icon" title="re-run" onClick={onRun} disabled={busy || status === 'running'}>↻</button>
          {sample.custom && onEditQuote && (
            <button type="button" className="pst-icon" title="edit" onClick={() => { setDraft(sample.quote); setEditing((e) => !e); }}>✎</button>
          )}
          <button type="button" className="pst-icon" title="remove" onClick={onDelete}>×</button>
        </div>
      </div>

      {editing && onEditQuote ? (
        <div className="pst-card__edit">
          <textarea
            className="pst-card__edit-area"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="pst-card__edit-actions">
            <button type="button" className="pst-link" onClick={() => { onEditQuote(draft.trim()); setEditing(false); }}>save</button>
            <button type="button" className="pst-link" onClick={() => setEditing(false)}>cancel</button>
          </div>
        </div>
      ) : (
        <div className="pst-card__quote">{sample.quote}</div>
      )}

      <div className="pst-card__out">
        {status === 'idle' && <div className="pst-card__idle">— not run yet</div>}
        {status === 'error' && <div className="pst-card__err">{run?.error ?? 'failed'}</div>}
        {showResponse && (
          <>
            {showPrev && (
              <div className="pst-card__prev" title="previous response">
                <span className="pst-card__prev-tag">before</span>
                {run!.prev}
              </div>
            )}
            <div
              className="pst-card__response"
              role="button"
              tabIndex={0}
              title="open as a thread"
              onClick={onOpenThread}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenThread(); }}
            >
              {run?.text}
              {status === 'running' && <span className="pst-caret" />}
            </div>
          </>
        )}
      </div>

      <div className="pst-card__foot">
        <div className="pst-card__meta">
          {status === 'done' && run && (
            <>~{approxTokens(run.text)} tok · {run.ms ?? 0}ms</>
          )}
          {status === 'running' && 'streaming…'}
        </div>
        <div className="pst-card__foot-actions">
          {status === 'done' && (
            <>
              <button type="button" className="pst-link" onClick={onNudgeClat} title="hand this to clat">clat</button>
              <button type="button" className="pst-link" onClick={onOpenThread}>continue →</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
