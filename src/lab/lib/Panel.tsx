// Bench primitive — Panel.
// A titled, collapsible container. Click the header to fold. Optional
// `meta` slot renders a small right-aligned status indicator in the
// header (counts, timing, etc).
//
// Each panel in the Run view is one of these. Designed to be cheap to
// stack — collapse what you're not watching, expand what you are.

import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  /** Optional small string shown right-aligned in the header. */
  meta?: ReactNode;
  /** Starting state. Defaults to expanded. */
  defaultOpen?: boolean;
  /** If true, the panel-body has zero padding so children control their
   *  own spacing. Useful for streams and tables. */
  flush?: boolean;
};

export function Panel({ title, children, meta, defaultOpen = true, flush }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const cls = `bench__panel ${open ? '' : 'bench__panel--collapsed'}`;
  return (
    <section className={cls}>
      <header
        className="bench__panel-head"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
      >
        <div className="bench__panel-title">{title}</div>
        <div className="bench__row bench__row--gap-3">
          {meta !== undefined && <span className="bench__panel-meta">{meta}</span>}
          <span className="bench__panel-toggle">{open ? '−' : '+'}</span>
        </div>
      </header>
      <div className={`bench__panel-body ${flush ? 'bench__panel-body--flush' : ''}`}>
        {children}
      </div>
    </section>
  );
}
