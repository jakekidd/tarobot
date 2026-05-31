// Bench primitive — Button.
// Three variants: default, primary, ghost. Plus a danger flavor for
// destructive actions. Otherwise just a styled <button>.

import type { ReactNode, MouseEvent } from 'react';

type Props = {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
};

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  type = 'button',
}: Props) {
  const cls = [
    'bench__btn',
    variant === 'primary' ? 'bench__btn--primary' : '',
    variant === 'ghost' ? 'bench__btn--ghost' : '',
    variant === 'danger' ? 'bench__btn--danger' : '',
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
