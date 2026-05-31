// Bench primitive — Empty.
// Italic faint inline message for "nothing here yet" states. Used
// inside Panels to keep the empty-state register consistent.

type Props = { children: string };

export function Empty({ children }: Props) {
  return <div className="bench__empty">{children}</div>;
}
