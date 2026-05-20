// Undo icon — a curved arrow returning to its starting point.
// Source: noun-undo-6198922.svg (The Noun Project). Inlined as a React
// component so it picks up CSS `color` via `fill="currentColor"`.

type Props = {
  className?: string;
  size?: number | string;
  title?: string;
};

export function UndoIcon({ className, size = '1em', title }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 1200 1200"
      fill="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      <path d="m1181.3 1084.3c-161.52-226.08-387.48-329.4-710.4-329.4v264.84l-452.16-452.04 452.16-452.04v258.36c452.04 64.441 645.84 387.36 710.4 710.28z" />
    </svg>
  );
}
