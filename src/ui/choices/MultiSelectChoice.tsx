// Multi-select picker. User toggles N boxes then submits. Used for
// "whats_true" and any future multi-select node in the tree.

import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';

type Props = {
  options: string[];
  disabled?: boolean;
  onPick: (values: string[]) => void;
};

export function MultiSelectChoice({ options, disabled, onPick }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggle(opt: string) {
    if (submitting) return;
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    setSelected(next);
  }

  function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    if (submitting) return;
    setSubmitting(true);
    const r = e.currentTarget.getBoundingClientRect();
    fireImpact({ x: e.clientX || r.left + r.width / 2, y: e.clientY || r.top + r.height / 2 });
    window.setTimeout(() => {
      onPick(Array.from(selected));
    }, 220);
  }

  return (
    <div className="multi-select">
      <ul className="choice-list">
        {options.map((o, i) => {
          const on = selected.has(o);
          return (
            <li key={`${i}-${o}`}>
              <button
                type="button"
                className={`choice-button ${on ? 'choice-button--multi-on' : ''} ${submitting && !on ? 'choice-button--unpicked' : ''}`}
                disabled={disabled || submitting}
                onClick={() => toggle(o)}
              >
                <span className="choice-button__text">
                  {on ? '☑ ' : '☐ '}{o}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn btn--chrome btn--big multi-select__submit"
        disabled={disabled || submitting}
        onClick={handleSubmit}
      >
        {selected.size === 0 ? 'none of these' : `submit (${selected.size})`}
      </button>
    </div>
  );
}
