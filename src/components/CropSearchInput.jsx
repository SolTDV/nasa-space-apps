import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { shortCropName } from '../utils/cropNames.js';

export default function CropSearchInput({ valueId, crops, onSelect, label }) {
  const selectedCrop = crops.find((c) => c.id === valueId);
  const displayName = shortCropName(selectedCrop);

  const [query, setQuery] = useState(displayName);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(displayName);
  }, [valueId, displayName]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(displayName);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [displayName]);

  const filtered = crops.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      shortCropName(c).toLowerCase().includes(query.toLowerCase()) ||
      c.botanicalFamily.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          aria-label={label}
          value={query}
          placeholder="Search crop..."
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-sm font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {open && query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-emerald-50 ${
                    c.id === valueId ? 'bg-emerald-50/70 font-bold text-emerald-800' : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{c.botanicalFamily}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-xs text-slate-400">No matching crops found</li>
          )}
        </ul>
      )}
    </div>
  );
}