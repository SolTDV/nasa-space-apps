import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { generateRotations, pickForGoal } from '../utils/rotationEngine.js';
import { IRRIGATION_COST_NOTE } from '../utils/cropScorer.js';
import CropSearchInput from './CropSearchInput.jsx';
import { shortCropName } from '../utils/cropNames.js';

const PRIORITY_OPTIONS = [
  {
    id: 'balanced',
    label: 'All-Round Balance',
    subtitle: 'Good yields, healthy soil & safe water use',
    icon: Scale,
    activeCls: 'border-slate-900 bg-slate-900 text-white shadow-xs',
    iconCls: 'text-slate-300',
    goalPhrase: 'an all-round balance',
  },
  {
    id: 'resilience',
    label: 'Break Pests & Build Soil',
    subtitle: 'Rotate crop families & add organic matter',
    icon: ShieldCheck,
    activeCls: 'border-emerald-600 bg-emerald-600 text-white shadow-xs',
    iconCls: 'text-emerald-100',
    goalPhrase: 'breaking pests and building soil',
  },
  {
    id: 'water',
    label: 'Save Water & Beat Drought',
    subtitle: 'Pick lower-water crops that protect soil moisture',
    icon: Droplets,
    activeCls: 'border-sky-600 bg-sky-600 text-white shadow-xs',
    iconCls: 'text-sky-100',
    goalPhrase: 'saving water',
  },
  {
    id: 'profit',
    label: 'Higher Profit & Less Fertilizer',
    subtitle: 'Use nitrogen-fixing legumes to cut fertilizer bills',
    icon: Sprout,
    activeCls: 'border-amber-600 bg-amber-600 text-white shadow-xs',
    iconCls: 'text-amber-100',
    goalPhrase: 'higher profit with less fertilizer',
  },
];

const GOAL_PHRASE = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.id, o.goalPhrase]));

// "saving water" / "saving water and breaking pests and building soil"
const joinGoals = (ids) => {
  const phrases = ids.map((id) => GOAL_PHRASE[id]);
  return phrases.length <= 1 ? phrases.join('') : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
};

const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

function DeltaPill({ pts, pct, unit = '', higherIsBetter = true, money = false }) {
  if (pts === undefined || pts === null) return null;
  if (Math.round(pts) === 0) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Same as now</span>;
  }
  const good = higherIsBetter ? pts > 0 : pts < 0;
  const Icon = pts > 0 ? ArrowUp : ArrowDown;
  const abs = money ? usd(Math.abs(pts)) : `${Math.abs(Math.round(pts))}${unit}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        good
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
          : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20'
      }`}
    >
      <Icon className="h-3 w-3" />
      {abs}
      {pct !== null && pct !== undefined && <span className="opacity-80"> ({pct > 0 ? '+' : ''}{pct}%)</span>}
    </span>
  );
}

function getRulePoints(rotation, ruleId) {
  return rotation.rules.find((r) => r.id === ruleId)?.points ?? 0;
}

export default function RotationTab({
  crops,
  climate,
  presetCrop,
  baselineSequence,
  onBaselineSequenceChange,
  rotationLength,
  onRotationLengthChange,
  farmSizeHa = 1,
  waterSupply = 'rainfed',
  elevationM = null,
  overrides,
  onOpenEconomics,
}) {
  const [selectedPriorityId, setSelectedPriorityId] = useState('balanced');

  const activePriority = useMemo(
    () => PRIORITY_OPTIONS.find((opt) => opt.id === selectedPriorityId) ?? PRIORITY_OPTIONS[0],
    [selectedPriorityId]
  );

  const hasCustomEconomics = useMemo(() => {
    if (!overrides || typeof overrides !== 'object') return false;
    return Object.entries(overrides).some(([key, val]) => {
      if (key === 'waterSupply') return false;
      if (typeof val === 'number') return val !== 100;
      if (typeof val === 'string') return val !== 'under20';
      return Boolean(val);
    });
  }, [overrides]);

  const handleBaselineSeasonChange = (seasonIndex, cropId) => {
    const next = [...baselineSequence];
    next[seasonIndex] = cropId;
    onBaselineSequenceChange(next);
  };

  const canResetBaseline = !baselineSequence.every((id) => id === presetCrop);

  const cropNameById = useMemo(() => Object.fromEntries(crops.map((c) => [c.id, shortCropName(c)])), [crops]);
  const cropById = useMemo(() => Object.fromEntries(crops.map((c) => [c.id, c])), [crops]);

  const result = useMemo(
    () =>
      generateRotations(crops, climate, {
        currentCropId: baselineSequence[0],
        baselineSequence,
        rotationLength,
        waterSupply,
        elevationM,
        overrides,
      }),
    [crops, climate, baselineSequence, rotationLength, waterSupply, elevationM, overrides]
  );

  // Each goal maps to one engine strategy; "All-Round Balance" = best average rank across the three
  const candidate = useMemo(() => pickForGoal(result, activePriority.id), [result, activePriority]);
  const baseline = result.baseline;

  if (!candidate) return null;

  const d = candidate.vsBaseline;

  const calcInputReductionPct = (rot) => {
    const baseCostSum = rot.sequence.reduce((sum, id) => sum + (cropById[id]?.benchmarkInputCostHa ?? 0), 0);
    if (baseCostSum <= 0 || !rot.fertilizerSaved) return 0;
    return Math.round((rot.fertilizerSaved / baseCostSum) * 100);
  };

  const baseInputCutPct = calcInputReductionPct(baseline);
  const candInputCutPct = calcInputReductionPct(candidate);

  const totalBaseProfit = baseline.netProfit3Yr * farmSizeHa;
  const totalCandProfit = candidate.netProfit3Yr * farmSizeHa;
  const totalProfitDelta = d.profitDelta * farmSizeHa;

  const sumIrrigation = (rot) => rot.perSeason.reduce((s, p) => s + (p.irrigationCostHa ?? 0), 0);
  const candIrrigation = sumIrrigation(candidate) * farmSizeHa;
  const baseIrrigation = sumIrrigation(baseline) * farmSizeHa;

  const totalBaseFert = baseline.fertilizerSaved * farmSizeHa;
  const totalCandFert = candidate.fertilizerSaved * farmSizeHa;
  const totalFertDelta = d.fertilizerSaved * farmSizeHa;

  // Plain-English takeaways: first why this plan fits the selected goal, then what it does for the field
  const plainReasons = (() => {
    const reasons = [];
    const profitPct = d.profitDeltaPct;
    const profitText =
      profitPct === null || profitPct === undefined ? '' : ` (${profitPct > 0 ? '+' : ''}${profitPct}% profit vs. now)`;
    if (activePriority.id === 'resilience') {
      reasons.push(`Picked for the best Soil & Pest Health score: ${candidate.resilienceScore}/100, compared with ${baseline.resilienceScore}/100 for your current plan.`);
    } else if (activePriority.id === 'water') {
      reasons.push(`Picked for low drought & water risk: ${candidate.waterRisk}/100, compared with ${baseline.waterRisk}/100 now (lower is safer).`);
    } else if (activePriority.id === 'profit') {
      reasons.push(
        candidate.hasLegume
          ? `Picked for the best profit after price risk among plans with a legume${profitText}, while the legume cuts fertilizer.`
          : `Picked for the best profit after price risk${profitText}.`
      );
    } else {
      reasons.push('Picked as the best all-round plan: it ranks well on soil health, water risk and profit at the same time.');
    }
    const seqCrops = candidate.sequence.map((id) => cropById[id]).filter(Boolean);
    const families = new Set(seqCrops.map((c) => c.botanicalFamily));
    if (families.size === rotationLength) {
      reasons.push(`Rotates across ${rotationLength} different plant families so soil pests and diseases cannot build up.`);
    }
    if (getRulePoints(candidate, 'nitrogen') > 0) {
      reasons.push('Includes a nitrogen-fixing legume that naturally feeds the next crop and cuts synthetic fertilizer costs.');
    }
    if (new Set(seqCrops.map((c) => c.rootDepth)).size > 1) {
      reasons.push('Mixes shallow and deep roots to loosen soil naturally and pull nutrients from deeper layers.');
    }
    if (d.waterRiskDeltaPts < -3) {
      reasons.push('Lowers drought and water stress compared to your current crop sequence.');
    }
    if (!reasons.length) {
      reasons.push('Matches your local temperature and rainfall window while diversifying harvest income.');
    }
    return reasons;
  })();

  const goalCardCls = (goalId) =>
    activePriority.id === goalId ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-200';

  return (
    <div className="space-y-6">
      {/* Step 1: Cycle Length & Primary Priority */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Step 1: Choose How Many Seasons to Plan</h2>
            <p className="text-xs text-slate-500">
              Pick 2 crops for a simple two-season switch, or 3–4 crops for stronger pest and soil protection.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {[
              { len: 2, label: '2 Crops (Minimum)' },
              { len: 3, label: '3 Crops (Suggested)' },
              { len: 4, label: '4 Crops (Suggested)' },
            ].map(({ len, label }) => {
              const active = rotationLength === len;
              return (
                <button
                  key={len}
                  type="button"
                  onClick={() => onRotationLengthChange(len)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    active ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900">Step 2: What Matters Most on Your Farm?</h2>
            <p className="text-xs text-slate-500">Click one goal below and we will pick the best crop order for your weather.</p>
          </div>

          <div role="radiogroup" aria-label="Primary Rotation Goal" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRIORITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const checked = opt.id === selectedPriorityId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setSelectedPriorityId(opt.id)}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                    checked
                      ? opt.activeCls
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${checked ? opt.iconCls : 'text-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight">{opt.label}</div>
                    <div className={`mt-1 text-xs leading-snug ${checked ? 'opacity-90' : 'text-slate-500'}`}>
                      {opt.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Step 3: Current Crops vs. Recommended Plan */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: Current Baseline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">What You Grow Now</span>
            {canResetBaseline && (
              <button
                type="button"
                onClick={() => onBaselineSequenceChange(Array(rotationLength).fill(presetCrop))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900">Your Current {rotationLength}-Season Plan</h3>
          <p className="mb-4 text-xs text-slate-500">
            Click any season box below to search and select the crop you currently plant.
          </p>

          <div className="space-y-2.5">
            {baseline.sequence.map((id, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5"
              >
                <span className="shrink-0 rounded-md bg-white px-2 py-1 font-mono text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                  Season {i + 1}
                </span>
                <CropSearchInput
                  label={`Season ${i + 1} crop`}
                  valueId={id}
                  crops={crops}
                  onSelect={(newCropId) => handleBaselineSeasonChange(i, newCropId)}
                />
                <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
                  Weather Fit {baseline.perSeason[i].envScore}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recommended Strategy */}
        <div className="rounded-2xl border-2 border-emerald-500/80 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Suggested Upgrade</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Best Match
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">{candidate.strategy.title}</h3>
          <p className={`${candidate.alsoBestFor.length ? 'mb-2' : 'mb-4'} text-xs text-slate-500`}>{candidate.strategy.description}</p>
          {candidate.alsoBestFor.length > 0 && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
              This is also the best plan for {joinGoals(candidate.alsoBestFor)}.
            </p>
          )}

          <div className="space-y-2.5">
            {candidate.sequence.map((id, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-3.5 py-2.5"
              >
                <span className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 font-mono text-xs font-bold text-white">
                  Season {i + 1}
                </span>
                <span className="text-sm font-bold text-slate-900">{cropNameById[id]}</span>
                <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-emerald-700">
                  Weather Fit {candidate.perSeason[i].envScore}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plain-English Summary of Benefits */}
      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-950">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Why This Rotation Works Better for Your Field
        </div>
        <ul className="mt-2.5 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
          {plainReasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-2 rounded-xl bg-white p-3 shadow-2xs ring-1 ring-slate-200/60">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="leading-relaxed">{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 4 Simple Outcome Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-2xl border bg-white p-4 shadow-xs ${goalCardCls('resilience')}`}>
          <div className="text-xs font-semibold text-slate-500">Soil &amp; Pest Health Score</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div>
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">{candidate.resilienceScore}</span>
              <span className="text-xs text-slate-400">/100</span>
            </div>
            <DeltaPill pts={d.resilienceDeltaPts} pct={d.resilienceDeltaPct} unit=" pts" />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Your current plan: <span className="font-semibold text-slate-700">{baseline.resilienceScore}/100</span>
          </div>
        </div>

        <div className={`rounded-2xl border bg-white p-4 shadow-xs ${goalCardCls('water')}`}>
          <div className="text-xs font-semibold text-slate-500">Drought &amp; Water Risk</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div>
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">{candidate.waterRisk}</span>
              <span className="text-xs text-slate-400">/100 (lower is safer)</span>
            </div>
            <DeltaPill pts={d.waterRiskDeltaPts} pct={d.waterRiskDeltaPct} unit=" pts" higherIsBetter={false} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Your current plan: <span className="font-semibold text-slate-700">{baseline.waterRisk}/100</span>
          </div>
        </div>

        <div className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs ${goalCardCls('profit')}`}>
          <div>
            <div className="text-xs font-semibold text-slate-500">
              {hasCustomEconomics ? `Estimated Profit (${farmSizeHa} ha)` : 'Expected Profit Change'}
            </div>

            {hasCustomEconomics ? (
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900">{usd(totalCandProfit)}</span>
                <DeltaPill pts={totalProfitDelta} pct={d.profitDeltaPct} money />
              </div>
            ) : (
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                  {d.profitDeltaPct !== null && d.profitDeltaPct !== undefined
                    ? `${d.profitDeltaPct > 0 ? '+' : ''}${d.profitDeltaPct}%`
                    : '—'}
                </span>
                <span className="text-xs text-slate-500">vs. current plan</span>
              </div>
            )}
          </div>

          {candIrrigation > 0 && (
            <div className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-900">
              <div>
                Estimated irrigation cost: <strong className="tabular-nums">{usd(candIrrigation)}</strong>
                <span className="text-sky-700"> (current plan {usd(baseIrrigation)})</span>
              </div>
              <div className="mt-0.5 text-sky-700">{IRRIGATION_COST_NOTE}</div>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            {hasCustomEconomics ? (
              <span>Current: <strong className="text-slate-700">{usd(totalBaseProfit)}</strong></span>
            ) : (
              <span>Using regional averages</span>
            )}
            {onOpenEconomics && (
              <button
                type="button"
                onClick={onOpenEconomics}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
              >
                <Sliders className="h-3 w-3" /> {hasCustomEconomics ? 'Edit prices' : 'Enter your prices'}
              </button>
            )}
          </div>
        </div>

        <div className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-xs ${goalCardCls('profit')}`}>
          <div>
            <div className="text-xs font-semibold text-slate-500">
              {hasCustomEconomics ? `Fertilizer Saved (${farmSizeHa} ha)` : 'Fertilizer Bill Reduction'}
            </div>

            {hasCustomEconomics ? (
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900">{usd(totalCandFert)}</span>
                <DeltaPill pts={totalFertDelta} pct={null} money />
              </div>
            ) : (
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                  {candInputCutPct > 0 ? `-${candInputCutPct}%` : '0%'}
                </span>
                <DeltaPill pts={candInputCutPct - baseInputCutPct} pct={null} unit="%" />
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-slate-500">
            {hasCustomEconomics ? (
              <span>Current: <strong className="text-slate-700">{usd(totalBaseFert)}</strong></span>
            ) : (
              <span>From legume nitrogen carryover</span>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Field Checklist & Detailed Agronomic Table */}
      <div className="space-y-3">
        <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-800">
            <span className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              Before You Plant: Field Checklist ({candidate.checklist.length} practical checks)
            </span>
            <span className="text-xs font-medium text-emerald-700 group-open:hidden">Show checklist</span>
            <span className="hidden text-xs font-medium text-slate-400 group-open:inline">Hide</span>
          </summary>
          <ul className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600 sm:grid-cols-2">
            {candidate.checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </details>

        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-bold text-slate-800">
            <span className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-600" />
              Detailed Technical Comparison (Pest, Nitrogen, Roots &amp; Weeds)
            </span>
            <span className="text-xs font-medium text-emerald-700 group-open:hidden">Show technical table</span>
            <span className="hidden text-xs font-medium text-slate-400 group-open:inline">Hide</span>
          </summary>

          <div className="divide-y divide-slate-100 border-t border-slate-200 text-sm">
            <div className="grid grid-cols-12 bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase tracking-wider">
              <div className="col-span-4 text-slate-500">Factor</div>
              <div className="col-span-4 text-rose-700">Your Current Plan</div>
              <div className="col-span-4 text-emerald-700">Suggested Plan</div>
            </div>

            {(() => {
              const describeSeq = (rot, inputCutPct, totalFert) => {
                const seqCrops = rot.sequence.map((id) => cropById[id]).filter(Boolean);
                const families = new Set(seqCrops.map((c) => c.botanicalFamily));
                let hasBackToBack = false;
                for (let i = 0; i < rot.sequence.length - 1; i++) {
                  if (rot.sequence[i] === rot.sequence[i + 1] || seqCrops[i]?.botanicalFamily === seqCrops[i + 1]?.botanicalFamily) {
                    hasBackToBack = true;
                    break;
                  }
                }

                const roots = [...new Set(seqCrops.map((c) => c.rootDepth))];
                const hasHighResidue = seqCrops.some((c) => c.residueLevel === 'high');
                const seasons = new Set(seqCrops.map((c) => c.seasonType));
                const nPts = getRulePoints(rot, 'nitrogen');

                return {
                  pest: hasBackToBack
                    ? { badge: 'High Risk', tone: 'risk', text: 'Same crop family planted back-to-back' }
                    : families.size === rotationLength
                    ? { badge: 'Low Risk', tone: 'good', text: `Rotates across ${rotationLength} separate crop families` }
                    : { badge: 'Moderate', tone: 'neutral', text: `Uses ${families.size} crop families` },
                  nitrogen:
                    nPts >= 20
                      ? {
                          badge: `-${inputCutPct}% Input Cost`,
                          tone: 'good',
                          text: hasCustomEconomics
                            ? `Legume feeds next crop (${usd(totalFert)} saved)`
                            : 'Legume supplies natural nitrogen to next crop',
                        }
                      : nPts > 0
                      ? { badge: 'Carryover Credit', tone: 'good', text: 'Leftover legume nitrogen helps later crop' }
                      : { badge: 'Full Fertilizer', tone: 'neutral', text: 'No legume nitrogen credit' },
                  roots:
                    roots.length > 1
                      ? { badge: 'Mixed Depths', tone: 'good', text: `${roots.join(' + ')} roots${hasHighResidue ? ' · adds organic matter' : ''}` }
                      : { badge: 'Same Depth', tone: 'risk', text: `${roots[0] || 'Uniform'} roots only` },
                  weeds:
                    seasons.size > 1
                      ? { badge: 'Disrupts Weeds', tone: 'good', text: 'Mixes cool & warm planting windows' }
                      : { badge: 'Same Window', tone: 'neutral', text: `Repeated ${[...seasons][0] || 'same'}-season weed cycle` },
                };
              };

              const baseDesc = describeSeq(baseline, baseInputCutPct, totalBaseFert);
              const candDesc = describeSeq(candidate, candInputCutPct, totalCandFert);

              const pillCls = {
                good: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
                risk: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',
                neutral: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/80',
              };

              const rows = [
                { label: 'Pest & Disease Carryover', left: baseDesc.pest, right: candDesc.pest },
                { label: 'Natural Nitrogen & Fertilizer', left: baseDesc.nitrogen, right: candDesc.nitrogen },
                { label: 'Root Depth & Soil Structure', left: baseDesc.roots, right: candDesc.roots },
                { label: 'Weed Suppression', left: baseDesc.weeds, right: candDesc.weeds },
              ];

              return rows.map((row) => (
                <div key={row.label} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5">
                  <div className="col-span-4 font-semibold text-slate-800">{row.label}</div>
                  <div className="col-span-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 font-semibold ${pillCls[row.left.tone]}`}>
                      {row.left.badge}
                    </span>
                    <span>{row.left.text}</span>
                  </div>
                  <div className="col-span-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 font-semibold ${pillCls[row.right.tone]}`}>
                      {row.right.badge}
                    </span>
                    <span>{row.right.text}</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </details>
      </div>
    </div>
  );
}