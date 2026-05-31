// Bench primitive — Field.
// Label + input wrapper. Pairs with raw <input>, <textarea>, or any
// custom control; just renders the chrome around them.

import type { ReactNode } from 'react';

type Props = {
  label: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, hint, children }: Props) {
  return (
    <div className="bench__field">
      <label className="bench__field-label">{label}</label>
      {children}
      {hint !== undefined && <span className="bench__field-hint">{hint}</span>}
    </div>
  );
}
