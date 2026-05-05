import React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className = '', children }: CardProps) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 ${className}`}>
      {children}
    </div>
  );
}
