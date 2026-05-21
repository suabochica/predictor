import React from 'react';

export const BUTTON_PRIMARY_CLASSES =
  'inline-flex items-center justify-center font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed bg-tertiary text-on-tertiary hover:brightness-80 text-label-md px-4 py-2';

export const BUTTON_GHOST_CLASSES =
  'inline-flex items-center justify-center font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-secondary hover:bg-surface-hover text-label-md px-5 py-3';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-tertiary text-on-tertiary hover:brightness-95',
    secondary: 'border border-tertiary text-tertiary bg-transparent hover:bg-tertiary/10',
    ghost: 'text-secondary hover:bg-surface-hover',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
