import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-label font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-tertiary text-on-tertiary hover:brightness-95',
    secondary: 'border border-tertiary text-tertiary bg-transparent hover:bg-tertiary/10',
    ghost: 'text-secondary hover:bg-surface-hover',
  };
  const sizes = { sm: 'text-label-caps px-3 py-1.5', md: 'text-label-md px-5 py-3', lg: 'text-body-md px-6 py-3.5' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
