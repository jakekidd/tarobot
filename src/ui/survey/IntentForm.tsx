// IntentForm — renders the "NOT YET" big-button in the MultipleChoice
// slot. Typing the actual question happens via the persistent
// ChatInput which sits ABOVE this button in the survey UI's intent
// state (text entry first, button second per UI convention for the
// intent sandwich).

type Props = {
  onNotYet: () => void;
};

export function IntentForm({ onNotYet }: Props) {
  return (
    <ul className="choice-list intent-form-list">
      <li>
        <button
          type="button"
          className="intent-form__not-yet-big"
          onClick={onNotYet}
        >
          NOT YET
        </button>
      </li>
    </ul>
  );
}
