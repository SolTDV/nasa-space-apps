import { AlertTriangle, CheckCircle2, Droplets } from 'lucide-react';
import { MONTH_NAMES } from '../utils/nasaApi.js';

// One plain-language verdict about soil water under the chosen scenario.
// The numbers behind it (trained soil-moisture model) stay hidden on purpose.

const TONE = {
  high: { Icon: AlertTriangle, box: 'border-rose-200 bg-rose-50/60', icon: 'text-rose-600', title: 'text-rose-800' },
  medium: { Icon: AlertTriangle, box: 'border-amber-200 bg-amber-50/60', icon: 'text-amber-600', title: 'text-amber-900' },
  low: { Icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50/50', icon: 'text-emerald-600', title: 'text-emerald-800' },
};

const CELL = {
  new: 'bg-rose-500 text-white',
  dry: 'bg-amber-200 text-amber-900',
  ok: 'bg-white text-slate-500 ring-1 ring-inset ring-slate-200',
};

const LEGEND = [
  ['new', 'Newly dry under this scenario'],
  ['dry', 'Already dry today'],
  ['ok', 'Normal'],
];

export default function WaterRiskCard({ risk }) {
  const tone = TONE[risk.level] ?? TONE.low;
  const { Icon } = tone;
  const shown = new Set(risk.monthFlags);

  return (
    <div className={`rounded-xl border p-4 ${tone.box}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} aria-hidden="true" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Soil Water Outlook</div>
            <h3 className={`text-base font-bold ${tone.title}`}>{risk.title}</h3>
            <p className="mt-0.5 text-sm text-slate-700">{risk.message}</p>
          </div>
        </div>
        {risk.rough && (
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
            Rough estimate
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-12 gap-1" aria-label="Soil moisture by month">
        {risk.monthFlags.map((flag, i) => (
          <div
            key={MONTH_NAMES[i]}
            title={`${MONTH_NAMES[i]}: ${LEGEND.find(([k]) => k === flag)[1]}`}
            className={`flex h-8 items-center justify-center rounded-md text-[11px] font-semibold ${CELL[flag]}`}
          >
            <span className="sm:hidden">{MONTH_NAMES[i][0]}</span>
            <span className="hidden sm:inline">{MONTH_NAMES[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {LEGEND.filter(([k]) => shown.has(k)).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className={`inline-block h-2.5 w-2.5 rounded-sm ${CELL[k]}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      {risk.advice.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {risk.advice.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-slate-800">
              <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {risk.extreme && (
        <p className="mt-2 text-xs text-slate-500">
          This scenario is more extreme than any year on record here. Treat it as a rough guide.
        </p>
      )}
    </div>
  );
}
