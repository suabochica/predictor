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
      className="group flex flex-col gap-3 rounded-md border border-border bg-surface p-5 transition-all hover:border-tertiary hover:shadow-lg"
    >
      <span className="text-4xl">{icon}</span>
      <div>
        <h2 className="font-heading text-h2 font-semibold text-primary group-hover:text-tertiary">
          {name}
        </h2>
        <p className="mt-1 text-body-sm text-secondary">{description}</p>
      </div>
    </a>
  );
}
