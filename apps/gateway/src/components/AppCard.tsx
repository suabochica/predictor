import React from 'react';

interface AppCardProps {
  name: string;
  description: string;
  href: string;
  icon: string;
}

export default function AppCard({ name, description, href, icon }: AppCardProps) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6 transition-all hover:border-[var(--color-accent)] hover:shadow-lg"
    >
      <span className="text-4xl">{icon}</span>
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-heading)] group-hover:text-[var(--color-accent)]">
          {name}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text)]">{description}</p>
      </div>
    </a>
  );
}
