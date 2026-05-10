type Props = {
  suggestions: string[];
  isBinary?: boolean;
  disabled?: boolean;
  onPick: (value: string) => void;
};

/**
 * Picks the right choice layout based on count and binary flag.
 *
 * Layouts:
 *  - binary           → yes / no / idk (3 buttons in a row)
 *  - 2 or 3 options   → vertical list (rows)
 *  - 4 options        → 2×2 matrix
 *  - 5 or 6 options   → 3×2 matrix (3 rows × 2 cols)
 *
 * Modular by design — adding a new layout is a new component file.
 */
export function MultipleChoice({ suggestions, isBinary, disabled, onPick }: Props) {
  if (isBinary) {
    return <ChoiceBinary suggestions={suggestions} disabled={disabled} onPick={onPick} />;
  }
  const n = suggestions.length;
  if (n === 0) return null;
  if (n <= 3) {
    return <ChoiceList suggestions={suggestions} disabled={disabled} onPick={onPick} />;
  }
  if (n === 4) {
    return <ChoiceMatrix2x2 suggestions={suggestions} disabled={disabled} onPick={onPick} />;
  }
  // 5 or 6
  return <ChoiceMatrix3x2 suggestions={suggestions} disabled={disabled} onPick={onPick} />;
}

// ─── Layout: List (2-3 rows) ────────────────────────────

function ChoiceList({ suggestions, disabled, onPick }: Props) {
  return (
    <ul className="choice-list">
      {suggestions.map((s, i) => (
        <li key={`${i}-${s}`}>
          <ChoiceButton label={s} disabled={disabled} onClick={() => onPick(s)} />
        </li>
      ))}
    </ul>
  );
}

// ─── Layout: 2×2 matrix (4 options) ─────────────────────

function ChoiceMatrix2x2({ suggestions, disabled, onPick }: Props) {
  return (
    <div className="choice-matrix choice-matrix--2x2">
      {suggestions.slice(0, 4).map((s, i) => (
        <ChoiceButton
          key={`${i}-${s}`}
          label={s}
          disabled={disabled}
          onClick={() => onPick(s)}
        />
      ))}
    </div>
  );
}

// ─── Layout: 3×2 matrix (5-6 options) ───────────────────

function ChoiceMatrix3x2({ suggestions, disabled, onPick }: Props) {
  const slots = suggestions.slice(0, 6);
  // Pad to 6 so layout doesn't collapse with 5.
  while (slots.length < 6) slots.push('');
  return (
    <div className="choice-matrix choice-matrix--3x2">
      {slots.map((s, i) =>
        s ? (
          <ChoiceButton
            key={`${i}-${s}`}
            label={s}
            disabled={disabled}
            onClick={() => onPick(s)}
          />
        ) : (
          <div key={`pad-${i}`} className="choice-button choice-button--placeholder" />
        ),
      )}
    </div>
  );
}

// ─── Layout: Binary (yes / no / idk) ────────────────────

function ChoiceBinary({ suggestions, disabled, onPick }: Props) {
  // Always render exactly yes/no/idk regardless of suggestions content,
  // unless the cognition supplied something else explicitly.
  const opts = suggestions.length >= 2 ? suggestions.slice(0, 4) : ['yes', 'no', 'idk'];
  return (
    <div className="choice-binary">
      {opts.map((s, i) => (
        <ChoiceButton
          key={`${i}-${s}`}
          label={s}
          disabled={disabled}
          variant="binary"
          onClick={() => onPick(s)}
        />
      ))}
    </div>
  );
}

// ─── Shared button ──────────────────────────────────────

function ChoiceButton({
  label,
  disabled,
  onClick,
  variant,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'binary';
}) {
  return (
    <button
      type="button"
      className={`choice-button ${variant ? `choice-button--${variant}` : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="choice-button__text">{label}</span>
    </button>
  );
}
