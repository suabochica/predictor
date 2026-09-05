import { useT } from '@predictor/i18n/react';
import { POSITIONS } from '../../config/constants';

// `''` is the sentinel for "no filter" in `filters.position`/`filters.country` —
// never the translated 'Todos'/'All' label. See I18N_PLAN.md Risk A.
const ALL_VALUE = '';

export default function FilterBar({ filters, onChange, resultCount, countries = [] }) {
  const t = useT();
  const allLabel = t('fantasy.filterBar.all');

  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      {/* Position pills */}
      <div className="flex flex-wrap gap-2">
        {[{ value: ALL_VALUE, label: allLabel }, ...POSITIONS.map((pos) => ({ value: pos, label: pos }))].map((opt) => (
          <button
            key={opt.value || 'all'}
            onClick={() => set('position', opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              (opt.value === ALL_VALUE ? !filters.position : filters.position === opt.value)
                ? 'bg-tertiary text-primary'
                : 'bg-surface-hover text-secondary hover:bg-border border border-border'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Country pills */}
      {countries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ value: ALL_VALUE, label: allLabel }, ...countries.map((c) => ({ value: c, label: c }))].map((opt) => (
            <button
              key={opt.value || 'all'}
              onClick={() => set('country', opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                (opt.value === ALL_VALUE ? !filters.country : filters.country === opt.value)
                  ? 'bg-info text-on-info'
                  : 'bg-surface-hover text-secondary hover:bg-border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Search + price + toggles */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Name search */}
        <input
          type="text"
          placeholder={t('fantasy.filterBar.searchPlaceholder')}
          value={filters.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
          className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-tertiary w-44"
        />

        {/* Max price */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted whitespace-nowrap">{t('fantasy.filterBar.maxPrice')}</label>
          <input
            type="number"
            min="0"
            max="20"
            step="0.5"
            placeholder={t('fantasy.filterBar.anyPrice')}
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
          <span className="text-xs text-secondary">{t('fantasy.filterBar.affordableOnly')}</span>
        </label>

        {/* Free agents only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.freeAgentsOnly ?? false}
            onChange={(e) => set('freeAgentsOnly', e.target.checked)}
            className="accent-tertiary w-3.5 h-3.5"
          />
          <span className="text-xs text-secondary">{t('fantasy.filterBar.freeAgentsOnly')}</span>
        </label>

        {/* Hide eliminated toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.hideEliminated ?? false}
            onChange={(e) => set('hideEliminated', e.target.checked)}
            className="accent-tertiary w-3.5 h-3.5"
          />
          <span className="text-xs text-secondary">{t('fantasy.filterBar.hideEliminated')}</span>
        </label>

        <span className="text-xs text-muted ml-auto">{t('fantasy.filterBar.resultCount', { n: resultCount })}</span>
      </div>
    </div>
  );
}
