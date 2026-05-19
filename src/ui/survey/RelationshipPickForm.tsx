// RelationshipPickForm — the answer widget for `relationship_pick` format.
//
// Three paths, in order of friction:
//   1. Click an existing-cast chip → instant submit with that person.
//   2. Click a category (parent/sibling/child/partner/ex/friend/cousin) →
//      inline "who specifically?" step: name input + off-limits toggle.
//   3. Click "write-in" → free-text name input + off-limits toggle.
//
// Submitted answer is a JSON-encoded structured payload. The engine
// parses it in applyOpenerDataIfRelevant (or per-question handler) to
// add/update the CastMember on the profile.

import { useState } from 'react';
import type { CastMember } from '../../pipeline/survey';

type Category =
  | 'parent'
  | 'sibling'
  | 'child'
  | 'partner'
  | 'ex'
  | 'friend'
  | 'cousin'
  | 'write-in';

type SubmitPayload = {
  category: Category | 'existing';
  /** Display label for the picked person. Used as the rendered answer +
   *  the CastMember.label. */
  name: string;
  /** If true, the detective will avoid drafting probes targeting this
   *  person. Default false. */
  off_limits: boolean;
};

type Props = {
  cast: CastMember[];
  onSubmit: (encoded: string) => void;
  onSkip?: () => void;
};

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'parent',   label: 'parent' },
  { id: 'sibling',  label: 'sibling' },
  { id: 'child',    label: 'child' },
  { id: 'partner',  label: 'partner' },
  { id: 'ex',       label: 'ex' },
  { id: 'friend',   label: 'friend' },
  { id: 'cousin',   label: 'cousin' },
  { id: 'write-in', label: 'someone else' },
];

export function RelationshipPickForm({ cast, onSubmit, onSkip }: Props) {
  const [picked, setPicked] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [offLimits, setOffLimits] = useState(false);

  function submit(payload: SubmitPayload) {
    onSubmit(JSON.stringify(payload));
  }

  function commitNamed(category: Category) {
    const cleaned = name.trim();
    if (!cleaned) return;
    submit({ category, name: cleaned, off_limits: offLimits });
  }

  function pickExisting(member: CastMember) {
    submit({ category: 'existing', name: member.label, off_limits: !!member.off_limits });
  }

  return (
    <div className="rel-pick">
      {cast.length > 0 && picked === null && (
        <div className="rel-pick__chips" aria-label="known people">
          {cast.map((m) => (
            <button
              key={m.label}
              type="button"
              className={`rel-pick__chip ${m.off_limits ? 'rel-pick__chip--off-limits' : ''}`}
              onClick={() => pickExisting(m)}
              title={m.off_limits ? 'off-limits — picked anyway' : `pick ${m.label}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {picked === null && (
        <ul className="choice-list rel-pick__categories">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="choice-button rel-pick__category"
                onClick={() => setPicked(c.id)}
              >
                <span className="choice-button__text">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked !== null && (
        <form
          className="rel-pick__details"
          onSubmit={(e) => { e.preventDefault(); commitNamed(picked); }}
        >
          <div className="rel-pick__details-head">
            <span className="rel-pick__details-category">{picked === 'write-in' ? 'someone else' : picked}</span>
            <button
              type="button"
              className="rel-pick__details-back"
              onClick={() => { setPicked(null); setName(''); setOffLimits(false); }}
            >
              ← change
            </button>
          </div>
          <input
            className="text-input text-input--ghost rel-pick__name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder(picked)}
            autoFocus
            autoComplete="off"
          />
          <label className="rel-pick__off-limits">
            <input
              type="checkbox"
              checked={offLimits}
              onChange={(e) => setOffLimits(e.target.checked)}
            />
            <span>off-limits — don't ask me about them later</span>
          </label>
          <button
            type="submit"
            className="btn btn--chrome btn--send rel-pick__commit"
            disabled={!name.trim()}
          >
            confirm
          </button>
        </form>
      )}

      {onSkip && picked === null && (
        <button
          type="button"
          className="rel-pick__skip"
          onClick={onSkip}
        >
          (skip this question)
        </button>
      )}
    </div>
  );
}

function namePlaceholder(c: Category): string {
  switch (c) {
    case 'parent':   return 'mom, dad, …';
    case 'sibling':  return 'their name, or "sis" / "bro"';
    case 'child':    return 'their name';
    case 'partner':  return 'their name';
    case 'ex':       return 'their name (or just "the ex")';
    case 'friend':   return 'their name';
    case 'cousin':   return 'their name';
    case 'write-in': return "what's their name?";
  }
}
