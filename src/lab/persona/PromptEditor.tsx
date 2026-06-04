// Left column — the persona prompt editor.
//
// One textarea (the working draft, auto-saved by the parent on change),
// three views: EDIT (monospace), CHANGES (line diff vs the last commit),
// PREVIEW (light markdown). COMMIT snapshots working→committed and fires
// a run over all samples; REVERT discards edits back to the last commit.
// COPY / EXPORT for getting the prompt out.

import { useState } from 'react';
import { lineDiff } from './diff';
import { Markdown } from './markdown';

type View = 'edit' | 'changes' | 'preview';

type Props = {
  working: string;
  committed: string;
  dirty: boolean;
  busy: boolean;
  onChange: (text: string) => void;
  onCommit: () => void;
  onRevert: () => void;
};

export function PromptEditor({
  working, committed, dirty, busy, onChange, onCommit, onRevert,
}: Props) {
  const [view, setView] = useState<View>('edit');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(working);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — no-op */ }
  }

  function exportMd() {
    const blob = new Blob([working], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `persona-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pst-editor">
      <div className="pst-editor__bar">
        <div className="pst-seg" role="tablist">
          {(['edit', 'changes', 'preview'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`pst-seg__btn ${view === v ? 'pst-seg__btn--on' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
              {v === 'changes' && dirty && <span className="pst-dot" aria-label="uncommitted changes" />}
            </button>
          ))}
        </div>
        <div className="pst-editor__bar-actions">
          <button type="button" className="pst-link" onClick={copy}>{copied ? 'copied' : 'copy'}</button>
          <button type="button" className="pst-link" onClick={exportMd}>export</button>
        </div>
      </div>

      <div className="pst-editor__body">
        {view === 'edit' && (
          <textarea
            className="pst-textarea"
            value={working}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            placeholder="the persona prompt. the seer's system prompt. tune it here."
          />
        )}
        {view === 'changes' && <ChangesView committed={committed} working={working} />}
        {view === 'preview' && (
          <div className="pst-preview"><Markdown source={working} /></div>
        )}
      </div>

      <div className="pst-editor__commit">
        <button
          type="button"
          className="pst-commit"
          onClick={onCommit}
          disabled={busy}
          title="save working → committed and run all samples"
        >
          {busy ? 'running…' : 'commit + run'}
          {dirty && !busy && <span className="pst-dot pst-dot--on-dark" />}
        </button>
        <button
          type="button"
          className="pst-revert"
          onClick={onRevert}
          disabled={busy || !dirty}
          title="discard edits back to the last commit"
        >
          revert
        </button>
      </div>
    </div>
  );
}

function ChangesView({ committed, working }: { committed: string; working: string }) {
  if (committed === working) {
    return <div className="pst-empty">no changes since last commit.</div>;
  }
  const rows = lineDiff(committed, working);
  return (
    <div className="pst-diff">
      {rows.map((r, i) => (
        <div key={i} className={`pst-diff__row pst-diff__row--${r.type}`}>
          <span className="pst-diff__gutter">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
          <span className="pst-diff__text">{r.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}
