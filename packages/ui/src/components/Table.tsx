import React from 'react';

export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-[var(--color-border)] ${className}`}>
      <table className="w-full text-sm text-[var(--color-text)]">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-[var(--color-border)] bg-[var(--color-border)]/20 text-xs uppercase tracking-wide text-[var(--color-text)]">
      {children}
    </thead>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[var(--color-border)]">{children}</tbody>;
}

export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-medium ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
