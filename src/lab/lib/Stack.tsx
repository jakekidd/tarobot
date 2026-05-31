// Bench primitive — Stack.
// Vertical flex container with a gap. The most-used layout primitive
// in Bench (and frankly anywhere). Variants: gap 1-5 mapped to the
// spacing scale.

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  gap?: 1 | 2 | 3 | 4 | 5;
};

export function Stack({ children, gap = 3 }: Props) {
  return <div className={`bench__stack bench__stack--gap-${gap}`}>{children}</div>;
}
