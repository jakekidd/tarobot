// Sandbox component — StateShelf.
//
// Left-column shelf listing declared state variables. Click a row
// to expand its current value inline. Add new variable via the +
// tile at the top. Edit initial value inline; the runner uses these
// as the starting state on RUN.

import { useState } from 'react';
import type { SandboxStateVar } from '../types';

type Props = {
  state: SandboxStateVar[];
  selectedName: string | null;
  onSelect: (name: string | null) => void;
  onAdd: (name: string) => void;
  onUpdate: (name: string, value: string) => void;
  onDelete: (name: string) => void;
};

export function StateShelf({
  state,
  selectedName,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function commitAdd() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAdding(false);
      setDraft('');
      return;
    }
    // Sanitize to identifier-ish — letters/digits/underscores only.
    const safe = trimmed.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
    if (!state.find((v) => v.name === safe)) {
      onAdd(safe);
    }
    setAdding(false);
    setDraft('');
  }

  return (
    <div className="sb-state-shelf">
      <div className="sb-state-shelf__head">
        <span className="bench__field-label">state</span>
        {!adding && (
          <button
            type="button"
            className="bench__btn bench__btn--ghost"
            onClick={() => setAdding(true)}
          >
            +
          </button>
        )}
      </div>
      {adding && (
        <div className="sb-state-shelf__add">
          <input
            type="text"
            className="bench__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="variable name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
            onBlur={commitAdd}
          />
        </div>
      )}
      {state.length === 0 && !adding ? (
        <div className="bench__empty">no variables yet</div>
      ) : (
        <ul className="sb-state-list">
          {state.map((v) => (
            <StateRow
              key={v.name}
              variable={v}
              expanded={selectedName === v.name}
              onSelect={() => onSelect(selectedName === v.name ? null : v.name)}
              onUpdate={(val) => onUpdate(v.name, val)}
              onDelete={() => onDelete(v.name)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StateRow({
  variable,
  expanded,
  onSelect,
  onUpdate,
  onDelete,
}: {
  variable: SandboxStateVar;
  expanded: boolean;
  onSelect: () => void;
  onUpdate: (val: string) => void;
  onDelete: () => void;
}) {
  const preview = variable.value
    ? variable.value.slice(0, 32) + (variable.value.length > 32 ? '…' : '')
    : '(empty)';
  return (
    <li className={`sb-state-row ${expanded ? 'sb-state-row--expanded' : ''}`}>
      <button type="button" className="sb-state-row__head" onClick={onSelect}>
        <span className="sb-state-row__name">{variable.name}</span>
        <span className="sb-state-row__preview">{preview}</span>
      </button>
      {expanded && (
        <div className="sb-state-row__body">
          <textarea
            className="bench__textarea"
            value={variable.value}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder="(empty — set initial value here or let an agent write to it)"
            rows={5}
          />
          <div className="bench__row bench__row--end bench__row--gap-2">
            <button
              type="button"
              className="bench__btn bench__btn--danger"
              onClick={onDelete}
            >
              delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
