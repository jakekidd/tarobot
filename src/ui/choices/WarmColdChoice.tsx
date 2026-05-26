// WarmColdChoice — UI for detective-emitted assertions.
//
// Two big buttons: COLD (blue, "this neighborhood is wrong") on the
// left and WARM (orange, "this neighborhood is right") on the right.
// After the primary pick, an optional text input invites a short
// correction. COLD is signal, not failure — it eliminates a region.
//
// Wire format submitted via onPick:
//   'warm'           — primary, no correction
//   'cold'           — primary, no correction
//   'warm:<text>'    — primary + correction text
//   'cold:<text>'    — primary + correction text

import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';
import { useChoiceReady } from './useChoiceReady';

type Props = {
  disabled?: boolean;
  onPick: (value: string) => void;
};

const PICK_ANIMATION_MS = 420;
const BEACON_DELAY_MS = 220;

type Phase = 'primary' | 'follow-up';
type PickState = 'idle' | 'picked' | 'unpicked';

export function WarmColdChoice({ disabled, onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [direction, setDirection] = useState<'warm' | 'cold' | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ready = useChoiceReady();

  function pickPrimary(dir: 'warm' | 'cold', x: number, y: number) {
    if (submitting) return;
    setDirection(dir);
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    setPhase('follow-up');
  }

  function submitFinal(value: string, x: number, y: number) {
    if (submitting) return;
    setSubmitting(true);
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(value), PICK_ANIMATION_MS);
  }

  const lockedDisabled = disabled || submitting || !ready;

  if (phase === 'primary') {
    const stateFor = (key: string): PickState =>
      direction === null ? 'idle' : `${direction}` === key ? 'picked' : 'unpicked';
    return (
      <div className="warm-cold warm-cold--primary">
        <WCButton
          label="cold"
          variant="cold"
          state={stateFor('cold')}
          disabled={lockedDisabled}
          onClick={(x, y) => pickPrimary('cold', x, y)}
        />
        <WCButton
          label="warm"
          variant="warm"
          state={stateFor('warm')}
          disabled={lockedDisabled}
          onClick={(x, y) => pickPrimary('warm', x, y)}
        />
      </div>
    );
  }

  // phase === 'follow-up' — gather optional correction text, OR submit
  // bare direction with the skip button.
  const skipValue = direction === 'warm' ? 'warm' : 'cold';
  return (
    <div className="warm-cold warm-cold--follow-up">
      <div className={`warm-cold__prompt warm-cold__prompt--${direction}`}>
        {direction === 'warm' ? "what's closer to true?" : "what's actually true?"}
      </div>
      <form
        className="warm-cold__freeform"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          const target = e.currentTarget.getBoundingClientRect();
          const value = trimmed ? `${direction}:${trimmed}` : `${direction}`;
          submitFinal(value, target.left + target.width / 2, target.top);
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="say more (optional)"
          disabled={lockedDisabled}
          autoFocus
          className="warm-cold__input"
        />
      </form>
      <WCButton
        label="nothing to add"
        variant="skip"
        state="idle"
        disabled={lockedDisabled}
        onClick={(x, y) => submitFinal(skipValue, x, y)}
      />
    </div>
  );
}

function WCButton({
  label,
  variant,
  state,
  disabled,
  onClick,
}: {
  label: string;
  variant: 'warm' | 'cold' | 'skip';
  state: PickState;
  disabled?: boolean;
  onClick: (clickX: number, clickY: number) => void;
}) {
  const classes = [
    'wc-button',
    `wc-button--${variant}`,
    state === 'picked' ? 'wc-button--picked' : '',
    state === 'unpicked' ? 'wc-button--unpicked' : '',
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
      <span className="wc-button__text">{label}</span>
    </button>
  );
}
