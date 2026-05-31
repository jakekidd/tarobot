// Bench primitive — Row.
// Horizontal flex container. `gap` works like Stack. `between` for
// space-between, `end` for right-align, `wrap` for wrapping rows.

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  gap?: 1 | 2 | 3 | 4;
  between?: boolean;
  end?: boolean;
  wrap?: boolean;
};

export function Row({ children, gap = 3, between, end, wrap }: Props) {
  const cls = [
    'bench__row',
    `bench__row--gap-${gap}`,
    between ? 'bench__row--between' : '',
    end ? 'bench__row--end' : '',
    wrap ? 'bench__row--wrap' : '',
  ].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
}
