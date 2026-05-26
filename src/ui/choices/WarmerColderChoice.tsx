// WarmerColderChoice — UI for detective-emitted assertions.
//
// Two big buttons: WARMER (orange, "getting closer to true") and
// COLDER (blue, "moving away"). After the primary pick, an optional
// text input invites a short correction. COLDER is signal, not
// failure — it's a directional vector pointing at where the truth
// isn't.
//
// Wire format submitted via onPick:
//   'warmer'           — primary, no correction
//   'colder'           — primary, no correction
//   'warmer:<text>'    — primary + correction text
//   'colder:<text>'    — primary + correction text

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

export function WarmerColderChoice({ disabled, onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [direction, setDirection] = useState<'warmer' | 'colder' | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ready = useChoiceReady();

  function pickPrimary(dir: 'warmer' | 'colder', x: number, y: number) {
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
      <div className="warmer-colder warmer-colder--primary">
        <WCButton
          label="colder"
          variant="colder"
          state={stateFor('colder')}
          disabled={lockedDisabled}
          onClick={(x, y) => pickPrimary('colder', x, y)}
        />
        <WCButton
          label="warmer"
          variant="warmer"
          state={stateFor('warmer')}
          disabled={lockedDisabled}
          onClick={(x, y) => pickPrimary('warmer', x, y)}
        />
      </div>
    );
  }

  // phase === 'follow-up' — gather optional correction text, OR submit
  // bare direction with the skip button.
  const skipValue = direction === 'warmer' ? 'warmer' : 'colder';
  return (
    <div className="warmer-colder warmer-colder--follow-up">
      <div className={`warmer-colder__prompt warmer-colder__prompt--${direction}`}>
        {direction === 'warmer' ? "what's even closer?" : "what's closer to true?"}
      </div>
      <form
        className="warmer-colder__freeform"
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
          className="warmer-colder__input"
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
  variant: 'warmer' | 'colder' | 'skip';
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
