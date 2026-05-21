import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-neutral text-secondary border border-border',
    success: 'bg-success/15 text-success border border-success/30',
    warning: 'bg-warning/15 text-warning border border-warning/30',
    danger: 'bg-error/15 text-error border border-error/30',
  };
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-label-caps font-label font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
