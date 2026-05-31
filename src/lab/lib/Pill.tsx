// Bench primitive — Pill.
// Small uppercase tag/badge. Variants for warm/cold/hot signal colors
// + good/warn for status + accent (the brand color). Lots of these
// across the panels: phase indicators, engagement state, agent status.

import type { ReactNode } from 'react';

type Variant = 'default' | 'accent' | 'cold' | 'warm' | 'hot' | 'good' | 'warn';

type Props = {
  children: ReactNode;
  variant?: Variant;
};

export function Pill({ children, variant = 'default' }: Props) {
  const cls = [
    'bench__pill',
    variant !== 'default' ? `bench__pill--${variant}` : '',
  ].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
