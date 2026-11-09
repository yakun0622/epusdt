import type { ButtonHTMLAttributes } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  busy?: boolean;
}
export function Button({ variant = 'primary', size = 'md', busy = false, className = '', disabled, children, ...rest }: ButtonProps) {
  return <button {...rest} disabled={disabled || busy}
    aria-busy={busy || undefined}
    className={['ui-button', 'ui-button--' + variant, 'ui-button--' + size, className].filter(Boolean).join(' ')}>
    {children}
  </button>;
}
