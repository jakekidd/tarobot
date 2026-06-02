// WarmColdChoice — UI for dowser-emitted guesses.
//
// Three big buttons: COLD (blue, "wrong neighbourhood; eliminate the
// region"), WARM (orange, "right neighbourhood; refine"), HOT (red,
// "dead on — that's the live wire"). After the primary pick, an
// optional text input invites a short correction. All three are
// useful signal — COLD eliminates, WARM refines, HOT confirms.
//
// HOT measures CHARGE, not truth: it's the subject saying "that's
// the one I'd actually ask about." A statement can be perfectly
// accurate and still get COLD if it isn't where the charge is.
//
// Wire format submitted via onPick:
//   'cold'           — primary, no correction
//   'warm'           — primary, no correction
//   'hot'            — primary, no correction
//   'cold:<text>'    — primary + correction text
//   'warm:<text>'    — primary + correction text
//   'hot:<text>'     — primary + correction text

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
type Direction = 'cold' | 'warm' | 'hot';

export function WarmColdChoice({ disabled, onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [direction, setDirection] = useState<Direction | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ready = useChoiceReady();

  function pickPrimary(dir: Direction, x: number, y: number) {
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
        <WCButton
          label="hot"
          variant="hot"
          state={stateFor('hot')}
          disabled={lockedDisabled}
          onClick={(x, y) => pickPrimary('hot', x, y)}
        />
      </div>
    );
  }

  // phase === 'follow-up' — gather optional correction text, OR submit
  // bare direction with the skip button.
  const skipValue: Direction = direction ?? 'cold';
  const promptText = direction === 'hot'
    ? 'in your own words?'
    : direction === 'warm'
    ? "what's closer to true?"
    : "what's actually true?";
  return (
    <div className="warm-cold warm-cold--follow-up">
      <div className={`warm-cold__prompt warm-cold__prompt--${direction}`}>
        {promptText}
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
  variant: 'warm' | 'cold' | 'hot' | 'skip';
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
