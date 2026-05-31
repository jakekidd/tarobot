// Bench primitive — Json.
// Pretty-printed JSON viewer. Just a styled <pre>. For pinned-state
// dumps, raw agent payloads, anything where the structure matters more
// than the rendered prose.

type Props = {
  value: unknown;
  /** Indentation level. Default 2. */
  indent?: number;
  /** Optional override for the max-height. */
  maxHeight?: number;
};

export function Json({ value, indent = 2, maxHeight }: Props) {
  let text: string;
  try {
    text = JSON.stringify(value, null, indent);
  } catch (e) {
    text = `<unserializable: ${String(e).slice(0, 120)}>`;
  }
  const style = maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : undefined;
  return <pre className="bench__json" style={style}>{text}</pre>;
}
