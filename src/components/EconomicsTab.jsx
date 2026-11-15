import { useMemo, useState } from 'react';
import { Coins, RotateCcw, Search, Truck } from 'lucide-react';
import { DISTANCE_OPTIONS, computeCropEconomics } from '../utils/cropScorer.js';

export const DEFAULT_OVERRIDES = {
  priceMultiplierPct: 100,
  costMultiplierPct: 100,
  distanceToMarket: 'under20',
  inputDiscountPct: 0,
};

const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

export default function EconomicsTab({ scored = [], overrides = DEFAULT_OVERRIDES, onOverridesChange, currentCrop }) {
  const [query, setQuery] = useState('');

  const update = (patch) => onOverridesChange({ ...overrides, ...patch });

  const isCustomized =
    overrides.priceMultiplierPct !== 100 ||
    overrides.costMultiplierPct !== 100 ||
    overrides.distanceToMarket !== 'under20';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored
      .filter(({ crop }) => !q || crop.name.toLowerCase().includes(q))
      .map(({ crop, score }) => ({
        crop,
        score,
        econ: computeCropEconomics(crop, score, overrides),
      }))
      .sort((a, b) => b.econ.netMarginHa - a.econ.netMarginHa);
  }, [scored, overrides, query]);

  return (
    <div className="space-y-6">
      {/* Step 1: Simple Local Price & Cost Sliders */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600">
              <Coins className="h-4 w-4" /> Local Market &amp; Input Settings
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Step 1: Adjust to Your Local Prices</h2>
            <p className="text-xs text-slate-500">
              Start with regional averages, or slide below if your local crop prices or fertilizer bills are higher or lower.
            </p>
          </div>

          {isCustomized && (
            <button
              type="button"
              onClick={() => onOverridesChange({ ...overrides, ...DEFAULT_OVERRIDES })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to Averages
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {/* Selling Price Slider */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Crop Selling Price</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-emerald-700 ring-1 ring-slate-200">
                {overrides.priceMultiplierPct}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={150}
              step={5}
              value={overrides.priceMultiplierPct}
              onChange={(e) => update({ priceMultiplierPct: Number(e.target.value) })}
              className="mt-3 w-full accent-emerald-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>Low market (-40%)</span>
              <span>Average</span>
              <span>High (+50%)</span>
            </div>
          </div>

          {/* Input Cost Slider */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Seed &amp; Fertilizer Costs</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-amber-700 ring-1 ring-slate-200">
                {overrides.costMultiplierPct}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={150}
              step={5}
              value={overrides.costMultiplierPct}
              onChange={(e) => update({ costMultiplierPct: Number(e.target.value) })}
              className="mt-3 w-full accent-amber-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>Cheaper (-40%)</span>
              <span>Average</span>
              <span>Expensive (+50%)</span>
            </div>
          </div>

          {/* Distance to Buyer */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Truck className="h-3.5 w-3.5 text-slate-500" />
              <span>Distance to Buyer / Market</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-200/70 p-1">
              {DISTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => update({ distanceToMarket: opt.id })}
                  className={`rounded-md py-1.5 text-xs font-semibold transition ${
                    overrides.distanceToMarket === opt.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Longer trips reduce profit on fresh vegetables &amp; fruits due to spoilage.
            </p>
          </div>
        </div>
      </section>

      {/* Step 2: Clean Profit Comparison Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Step 2: Estimated Profit per Hectare ($/ha)</h2>
            <p className="text-xs text-slate-500">
              Sorted from highest net profit to lowest based on your local weather fit and prices.
              {overrides.waterSupply === 'irrigated' && ' Input costs include irrigation (pumping, fuel, canal fees).'}
            </p>
          </div>

          <div className="relative min-w-[210px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter crops…"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Crop</th>
                <th className="px-4 py-3 text-right">Est. Yield</th>
                <th className="px-4 py-3 text-right">Gross Sales</th>
                <th className="px-4 py-3 text-right">Input Costs</th>
                <th className="px-5 py-3 text-right">Net Profit / ha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ crop, score, econ }) => {
                const isCurrent = crop.id === currentCrop;
                return (
                  <tr
                    key={crop.id}
                    className={isCurrent ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80'}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{crop.name.split(' (')[0]}</span>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Your Crop
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Weather fit: {score.envScore}% · {econ.perishabilityRisk !== 'None' ? `${econ.perishabilityRisk} transport spoilage risk` : 'Easy to store & transport'}
                      </div>
                      {econ.yieldTha === 0 && (
                        <div className="mt-0.5 text-[11px] font-semibold text-rose-600">
                          Too hot or too cold to grow here: no harvest expected, only seed and input costs.
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                      {econ.yieldTha} t/ha
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                      {usd(econ.revenueHa)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-500">
                      -{usd(econ.inputCostHa)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm font-extrabold">
                      <span className={econ.netMarginHa >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {usd(econ.netMarginHa)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}