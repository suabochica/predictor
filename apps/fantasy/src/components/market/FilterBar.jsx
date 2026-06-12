import { POSITIONS } from '../../config/constants';

export default function FilterBar({ filters, onChange, resultCount, countries = [] }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      {/* Position pills */}
      <div className="flex flex-wrap gap-2">
        {['Todos', ...POSITIONS].map((pos) => (
          <button
            key={pos}
            onClick={() => set('position', pos === 'Todos' ? '' : pos)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              (pos === 'Todos' && !filters.position) || filters.position === pos
                ? 'bg-tertiary text-primary'
                : 'bg-surface-hover text-secondary hover:bg-border border border-border'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Country pills */}
      {countries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {['Todos', ...countries].map((c) => (
            <button
              key={c}
              onClick={() => set('country', c === 'Todos' ? '' : c)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                (c === 'Todos' && !filters.country) || filters.country === c
                  ? 'bg-info text-on-info'
                  : 'bg-surface-hover text-secondary hover:bg-border'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Search + price + toggles */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Name search */}
        <input
          type="text"
          placeholder="Buscar jugador…"
          value={filters.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
          className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-tertiary w-44"
        />

        {/* Max price */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted whitespace-nowrap">Precio máx.</label>
          <input
            type="number"
            min="0"
            max="20"
            step="0.5"
            placeholder="Cualquiera"
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              set('maxPrice', e.target.value === '' ? '' : Number(e.target.value))
            }
            className="bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-sm text-primary w-20 focus:outline-none focus:border-tertiary"
          />
          <span className="text-xs text-muted">M</span>
        </div>

        {/* Affordable only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.affordableOnly ?? false}
            onChange={(e) => set('affordableOnly', e.target.checked)}
            className="accent-tertiary w-3.5 h-3.5"
          />
          <span className="text-xs text-secondary">Solo asequibles</span>
        </label>

        {/* Free agents only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.freeAgentsOnly ?? false}
            onChange={(e) => set('freeAgentsOnly', e.target.checked)}
            className="accent-tertiary w-3.5 h-3.5"
          />
          <span className="text-xs text-secondary">Solo agentes libres</span>
        </label>

        <span className="text-xs text-muted ml-auto">{resultCount} jugadores</span>
      </div>
    </div>
  );
}
