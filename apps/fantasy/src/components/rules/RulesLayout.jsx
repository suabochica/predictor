export function Section({ title, children }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-primary mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function Bullet() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary mr-2 mb-0.5 align-middle" />;
}
