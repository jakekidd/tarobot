// Right column — the sample rail.
//
// Header: run-all, model select, add-sample. Body: one SampleCard per
// visible sample. The rail is presentational; the parent owns runs and
// fires the inference.

import { useState } from 'react';
import type { Sample } from './samples';
import type { PersonaModel } from './storage';
import type { RunState } from './types';
import { SampleCard } from './SampleCard';

const MODEL_LABEL: Record<PersonaModel, string> = {
  fast: 'fast · haiku',
  cognition: 'sonnet',
  deep: 'deep · opus',
};

type Props = {
  samples: Sample[];
  runs: Record<string, RunState>;
  model: PersonaModel;
  busy: boolean;
  onModelChange: (m: PersonaModel) => void;
  onRunAll: () => void;
  onRunOne: (id: string) => void;
  onOpenThread: (sample: Sample) => void;
  onNudgeClat: (sample: Sample) => void;
  onAddSample: (quote: string, tag: string) => void;
  onDeleteSample: (id: string) => void;
  onEditSample: (id: string, quote: string) => void;
};

export function SampleRail({
  samples, runs, model, busy,
  onModelChange, onRunAll, onRunOne, onOpenThread, onNudgeClat,
  onAddSample, onDeleteSample, onEditSample,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState('');
  const [tag, setTag] = useState('');

  function submitAdd() {
    const q = quote.trim();
    if (!q) return;
    onAddSample(q, tag.trim() || 'custom');
    setQuote(''); setTag(''); setAdding(false);
  }

  return (
    <div className="pst-rail">
      <div className="pst-rail__bar">
        <button type="button" className="pst-runall" onClick={onRunAll} disabled={busy}>
          {busy ? 'running…' : `run all (${samples.length})`}
        </button>
        <select
          className="pst-select"
          value={model}
          onChange={(e) => onModelChange(e.target.value as PersonaModel)}
          title="model the seer runs on"
        >
          {(['fast', 'cognition', 'deep'] as PersonaModel[]).map((m) => (
            <option key={m} value={m}>{MODEL_LABEL[m]}</option>
          ))}
        </select>
        <button type="button" className="pst-link" onClick={() => setAdding((a) => !a)}>+ add</button>
      </div>

      {adding && (
        <div className="pst-add">
          <textarea
            className="pst-add__quote"
            placeholder="a thing the seeker says…"
            value={quote}
            spellCheck={false}
            onChange={(e) => setQuote(e.target.value)}
          />
          <div className="pst-add__row">
            <input
              className="pst-add__tag"
              placeholder="tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <button type="button" className="pst-link" onClick={submitAdd}>add sample</button>
          </div>
        </div>
      )}

      <div className="pst-rail__list">
        {samples.map((s) => (
          <SampleCard
            key={s.id}
            sample={s}
            run={runs[s.id]}
            busy={busy}
            onRun={() => onRunOne(s.id)}
            onOpenThread={() => onOpenThread(s)}
            onNudgeClat={() => onNudgeClat(s)}
            onDelete={() => onDeleteSample(s.id)}
            onEditQuote={s.custom ? (q) => onEditSample(s.id, q) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
