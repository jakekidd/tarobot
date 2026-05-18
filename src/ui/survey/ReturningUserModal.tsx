// Returning-user modal. Appears after Q1 name submit when one or more
// existing Person records match the typed name.
//
// Two layouts:
//   - 1 match → binary RESUME / START FRESH
//   - 2+      → disambiguator: pick a Person, or "none of these"
//
// Mascot-narrated copy is rendered inline so it reads as part of the
// dialogue stream rather than a chrome alert.

import { useState } from 'react';
import type { ReturningMatch } from '../../pipeline/survey';

type Props = {
  name: string;
  matches: ReturningMatch[];
  onResume: (match: ReturningMatch) => void;
  onStartFresh: () => void;
};

export function ReturningUserModal({ name, matches, onResume, onStartFresh }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(
    matches.length === 1 ? matches[0]!.person_id : null,
  );
  const single = matches.length === 1;
  const picked = matches.find((m) => m.person_id === pickedId) ?? null;

  return (
    <div className="returning-modal" role="dialog" aria-label="returning user check">
      <div className="returning-modal__inner">
        <p className="returning-modal__prompt">
          {single
            ? `looks like ${formatName(name)} has been here before.`
            : `several ${formatName(name)}s have been here. which is you?`}
        </p>

        {!single && (
          <ul className="returning-modal__list">
            {matches.map((m) => (
              <li key={m.person_id}>
                <button
                  className={`returning-modal__option ${pickedId === m.person_id ? 'returning-modal__option--on' : ''}`}
                  onClick={() => setPickedId(m.person_id)}
                  type="button"
                >
                  <span className="returning-modal__option-name">{m.profile.name}</span>
                  <span className="returning-modal__option-meta">{m.display_summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {single && picked && picked.display_summary && (
          <p className="returning-modal__meta">{picked.display_summary}</p>
        )}

        <div className="returning-modal__actions">
          <button
            className="btn btn--primary"
            onClick={() => picked && onResume(picked)}
            disabled={!picked}
            type="button"
          >
            {single ? 'RESUME' : 'YES, THAT’S ME'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={onStartFresh}
            type="button"
          >
            {single ? 'START FRESH' : 'NONE OF THESE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatName(name: string): string {
  return name.trim();
}
