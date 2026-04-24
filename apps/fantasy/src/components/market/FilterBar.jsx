import { POSITIONS } from '../../config/constants';

export default function FilterBar({ filters, onChange, resultCount }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      {/* Position pills */}
      <div className="flex flex-wrap gap-2">
        {['All', ...POSITIONS].map((pos) => (
          <button
            key={pos}
            onClick={() => set('position', pos === 'All' ? '' : pos)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              (pos === 'All' && !filters.position) || filters.position === pos
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Search + price + toggles */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Name search */}
        <input
          type="text"
          placeholder="Search player…"
          value={filters.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-600 w-44"
        />

        {/* Max price */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Max price</label>
          <input
            type="number"
            min="0"
            max="20"
            step="0.5"
            placeholder="Any"
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              set('maxPrice', e.target.value === '' ? '' : Number(e.target.value))
            }
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white w-20 focus:outline-none focus:border-emerald-600"
          />
          <span className="text-xs text-gray-500">M</span>
        </div>

        {/* Affordable only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.affordableOnly ?? false}
            onChange={(e) => set('affordableOnly', e.target.checked)}
            className="accent-emerald-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-400">Affordable only</span>
        </label>

        {/* Hide owned toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.hideOwned ?? true}
            onChange={(e) => set('hideOwned', e.target.checked)}
            className="accent-emerald-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-400">Hide owned</span>
        </label>

        <span className="text-xs text-gray-600 ml-auto">{resultCount} players</span>
      </div>
    </div>
  );
}
