// Bench primitive — Kv (key/value grid).
// Two-column grid for compact state display: keys on the left in mono
// faint, values on the right. Used in the Phase panel, the agent rows,
// anywhere a labeled fact list reads better than prose.

import type { ReactNode } from 'react';

type Row = { key: string; value: ReactNode };

type Props = {
  rows: Row[];
};

export function Kv({ rows }: Props) {
  return (
    <div className="bench__kv">
      {rows.map((r, i) => (
        <div key={`${i}-${r.key}`} style={{ display: 'contents' }}>
          <span className="bench__kv-key">{r.key}</span>
          <span className="bench__kv-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
