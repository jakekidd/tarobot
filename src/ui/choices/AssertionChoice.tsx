// AssertionChoice — UI for the v3 'assertion' instrument.
//
// The dialogue line above this widget renders the detective's
// statement. This component handles the binary primary response
// (TRUE / FALSE) and, on FALSE, the correction surface (one-tap
// correction_inversions + freeform text fallback + "just false,
// nothing to add" escape).
//
// Wire format submitted via onPick:
//   'true'              → confirmed
//   'false'             → rejected (no correction)
//   'corrected:<text>'  → rejected_with_correction
//
// The mascot's comment_if_<answer> line is spoken BY THE DIALOGUE
// (Survey.tsx reads the pick + instrument and switches dialogText
// to the appropriate stall line). This component just drives the
// click flow.

import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';
import { useChoiceReady } from './useChoiceReady';

type Props = {
  /** Optional pre-baked correction options from the detective. Up to
   *  4 short candidates the user can tap instead of typing. */
  correction_inversions?: string[];
  disabled?: boolean;
  onPick: (value: string) => void;
};

const PICK_ANIMATION_MS = 420;
const BEACON_DELAY_MS = 220;

type Phase = 'primary' | 'correcting';
type PickState = 'idle' | 'picked' | 'unpicked';

export function AssertionChoice({ correction_inversions, disabled, onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const ready = useChoiceReady();

  function submit(value: string, key: string, x: number, y: number) {
    if (pickedKey !== null) return;
    setPickedKey(key);
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(value), PICK_ANIMATION_MS);
  }

  const stateFor = (key: string): PickState =>
    pickedKey === null ? 'idle' : pickedKey === key ? 'picked' : 'unpicked';
  const lockedDisabled = disabled || pickedKey !== null || !ready;

  if (phase === 'primary') {
    return (
      <div className="assertion-choice assertion-choice--primary">
        <AssertionButton
          label="true"
          variant="true"
          state={stateFor('true')}
          disabled={lockedDisabled}
          onClick={(x, y) => submit('true', 'true', x, y)}
        />
        <AssertionButton
          label="false"
          variant="false"
          state={stateFor('false')}
          disabled={lockedDisabled}
          onClick={() => setPhase('correcting')}
        />
      </div>
    );
  }

  // phase === 'correcting'
  const inversions = correction_inversions ?? [];
  return (
    <div className="assertion-choice assertion-choice--correcting">
      <div className="assertion-choice__correction-prompt">what's closer?</div>
      {inversions.length > 0 && (
        <ul className="assertion-choice__inversions">
          {inversions.map((inv, i) => (
            <li key={`${i}-${inv}`}>
              <AssertionButton
                label={inv}
                variant="inversion"
                state={stateFor(`inv-${i}`)}
                disabled={lockedDisabled}
                onClick={(x, y) => submit(`corrected:${inv}`, `inv-${i}`, x, y)}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="assertion-choice__freeform"
        onSubmit={(e) => {
          e.preventDefault();
          const text = correctionText.trim();
          if (!text || pickedKey !== null) return;
          const target = e.currentTarget.getBoundingClientRect();
          submit(`corrected:${text}`, 'freeform', target.left + target.width / 2, target.top);
        }}
      >
        <input
          type="text"
          value={correctionText}
          onChange={(e) => setCorrectionText(e.target.value)}
          placeholder="or type what's true…"
          disabled={lockedDisabled}
          autoFocus
          className="assertion-choice__freeform-input"
        />
      </form>
      <AssertionButton
        label="nothing to add"
        variant="skip"
        state={stateFor('skip')}
        disabled={lockedDisabled}
        onClick={(x, y) => submit('false', 'skip', x, y)}
      />
    </div>
  );
}

function AssertionButton({
  label,
  variant,
  state,
  disabled,
  onClick,
}: {
  label: string;
  variant: 'true' | 'false' | 'inversion' | 'skip';
  state: PickState;
  disabled?: boolean;
  onClick: (clickX: number, clickY: number) => void;
}) {
  const classes = [
    'assertion-button',
    `assertion-button--${variant}`,
    state === 'picked' ? 'assertion-button--picked' : '',
    state === 'unpicked' ? 'assertion-button--unpicked' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX || r.left + r.width / 2;
        const y = e.clientY || r.top + r.height / 2;
        onClick(x, y);
      }}
    >
      <span className="assertion-button__text">{label}</span>
    </button>
  );
}
