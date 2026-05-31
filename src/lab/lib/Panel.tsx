// Bench primitive — Panel (section, really).
// Light-mode flat redesign — no box borders, just a labeled rule line
// at the top. Click the title row to fold/unfold. Optional `meta` slot
// renders a small right-aligned status indicator in the header.

import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  /** Optional small string shown right-aligned in the header. */
  meta?: ReactNode;
  /** Starting state. Defaults to expanded. */
  defaultOpen?: boolean;
};

export function Panel({ title, children, meta, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const cls = `bench__section ${open ? '' : 'bench__section--collapsed'}`;
  return (
    <section className={cls}>
      <header
        className="bench__section-head"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
      >
        <div className="bench__section-title">{title}</div>
        <div className="bench__section-meta">
          {meta !== undefined && <span>{meta}</span>}
          <span className="bench__section-toggle">{open ? '−' : '+'}</span>
        </div>
      </header>
      <div className="bench__section-body">{children}</div>
    </section>
  );
}
