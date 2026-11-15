import { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Search, Sprout } from 'lucide-react';

const FIT_BADGE = (score) => {
  if (score >= 80) return { label: 'Great Match', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', bar: 'bg-emerald-500' };
  if (score >= 60) return { label: 'Good Match', cls: 'bg-sky-50 text-sky-700 ring-sky-600/20', bar: 'bg-sky-500' };
  if (score >= 40) return { label: 'Fair / Risky', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', bar: 'bg-amber-500' };
  return { label: 'Poor Fit', cls: 'bg-rose-50 text-rose-700 ring-rose-600/20', bar: 'bg-rose-400' };
};

export default function CropFitTab({ scored = [] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'strong' | 'warm' | 'cool'
  const [expandedId, setExpandedId] = useState(null);

  const topThree = useMemo(() => scored.slice(0, 3), [scored]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored.filter(({ crop, score }) => {
      if (q && !crop.name.toLowerCase().includes(q) && !crop.botanicalFamily?.toLowerCase().includes(q)) {
        return false;
      }
      if (filter === 'strong' && score.envScore < 75) return false;
      if (filter === 'warm' && crop.seasonType !== 'warm') return false;
      if (filter === 'cool' && crop.seasonType !== 'cool') return false;
      return true;
    });
  }, [scored, query, filter]);

  return (
    <div className="space-y-6">
      {/* Top 3 Spotlight Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
          <Sprout className="h-4 w-4" /> Top Matches for Your Local Weather
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-900">Which Crops Grow Best Here?</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Ranked using 20 years of local temperature, rainfall, and soil moisture data for your farm.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {topThree.map(({ crop, score }, idx) => (
            <div
              key={crop.id}
              className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  #{idx + 1} Best Fit
                </span>
                <span className="text-sm font-extrabold tabular-nums text-emerald-800">
                  {score.envScore}% Match
                </span>
              </div>
              <div className="mt-2 text-base font-bold text-slate-900">{crop.name.split(' (')[0]}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                Best window: <strong>{score.growingMonths[0]}–{score.growingMonths[score.growingMonths.length - 1]}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Search & Simple Filter Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any crop (e.g., Maize, Mung Bean)…"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `All Crops (${scored.length})` },
              { id: 'strong', label: 'Great Match (75%+)' },
              { id: 'warm', label: 'Warm Season' },
              { id: 'cool', label: 'Cool Season' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === btn.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clean Crop Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ crop, score }) => {
            const badge = FIT_BADGE(score.envScore);
            const isOpen = expandedId === crop.id;

            return (
              <div
                key={crop.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{crop.name.split(' (')[0]}</h3>
                      <span className="text-[11px] text-slate-500">
                        {crop.seasonType === 'warm' ? 'Warm-season' : 'Cool-season'} · {crop.waterUse} water need
                      </span>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${badge.cls}`}>
                      {score.envScore}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${badge.bar}`}
                      style={{ width: `${score.envScore}%` }}
                    />
                  </div>

                  {/* Plain-English Facts */}
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Best planting window:</span>
                      <span className="font-semibold text-slate-800">
                        {score.growingMonths[0]} – {score.growingMonths[score.growingMonths.length - 1]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Main watch-out:</span>
                      <span className="font-semibold text-slate-800">{score.limitingFactor}</span>
                    </div>
                  </div>
                </div>

                {/* Expandable Technical Breakdown */}
                <div className="mt-3 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : crop.id)}
                    className="flex w-full items-center justify-between text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    <span>{isOpen ? 'Hide weather details' : 'Show weather details'}</span>
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {isOpen && (
                    <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                      <div>Temperature Fit: <strong>{score.thermalFit}%</strong></div>
                      <div>Rainfall Fit: <strong>{score.rainFit}%</strong></div>
                      <div>Soil Moisture Fit: <strong>{score.rootMoistureFit}%</strong></div>
                      <div>Sunlight Fit: <strong>{score.solarFit}%</strong></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            No crops match that filter. Try clearing your search or selecting <strong>All Crops</strong>.
          </div>
        )}
      </section>
    </div>
  );
}