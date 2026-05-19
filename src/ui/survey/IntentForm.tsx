// IntentForm — only renders the "I DON'T KNOW" big-button in the
// MultipleChoice slot. Typing the actual question happens via the
// persistent ChatInput at the bottom of the survey screen, which is
// wired to submitAnswer for the intent question.

type Props = {
  onDontKnow: () => void;
};

export function IntentForm({ onDontKnow }: Props) {
  return (
    <ul className="choice-list intent-form-list">
      <li>
        <button
          type="button"
          className="intent-form__dont-know-big"
          onClick={onDontKnow}
        >
          I DON'T KNOW
        </button>
      </li>
    </ul>
  );
}
