import { VALID_FORMATIONS } from '../../config/constants';

export default function FormationPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VALID_FORMATIONS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            value === f
              ? 'bg-tertiary text-primary'
              : 'bg-surface-hover text-secondary hover:bg-border border border-border'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
