import React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className = '', children }: CardProps) {
  return (
    <div className={`rounded-md border border-border bg-surface p-5 text-primary ${className}`}>
      {children}
    </div>
  );
}
