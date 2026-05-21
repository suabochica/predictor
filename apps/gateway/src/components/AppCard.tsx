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
      <img src={icon} className="w-10 h-10" alt="" />
      <div>
        <h2 className="font-atomic text-h2 font-semibold text-primary group-hover:text-tertiary">
          {name}
        </h2>
        <p className="mt-1 text-body-sm text-secondary">{description}</p>
      </div>
    </a>
  );
}
