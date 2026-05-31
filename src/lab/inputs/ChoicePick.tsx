// Bench input — ChoicePick.
// Vertically stacked option buttons. Handles 'choice', 'binary',
// 'matrix', 'relationship_status' formats. The simplest interaction:
// click an option, it submits.

type Props = {
  options: readonly string[];
  onPick: (value: string) => void;
};

export function ChoicePick({ options, onPick }: Props) {
  return (
    <div className="bench__choices">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="bench__choice"
          onClick={() => onPick(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
