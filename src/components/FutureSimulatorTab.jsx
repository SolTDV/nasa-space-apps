import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flame,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { scoreAllCrops } from '../utils/cropScorer.js';
import { generateRotations } from '../utils/rotationEngine.js';
import { MONTH_NAMES } from '../utils/nasaApi.js';
import { assessWaterRisk, isUsable, simulateSoil, trainSoilModel } from '../utils/soilMoistureModel.js';
import WaterRiskCard from './WaterRiskCard.jsx';
import { shortCropName } from '../utils/cropNames.js';

const SCENARIOS = [
  {
    id: '2040_ssp245',
    label: '2040 Moderate (SSP2-4.5)',
    subtitle: '+1.5°C warming · slight rainfall shift',
    year: 2040,
    tempDelta: 1.5,
    rainPct: -3,
  },
  {
    id: '2040_ssp585',
    label: '2040 High Warming (SSP5-8.5)',
    subtitle: '+2.2°C warming · drier dry seasons',
    year: 2040,
    tempDelta: 2.2,
    rainPct: -8,
  },
  {
    id: '2060_stress',
    label: '2060 Hot & Dry Stress',
    subtitle: '+3.2°C warming · -15% rainfall',
    year: 2060,
    tempDelta: 3.2,
    rainPct: -15,
  },
  {
    id: 'local_trend',
    label: 'Local 2040 Trend Projection',
    subtitle: 'Extrapolated from your field’s 20-yr NASA shift',
    year: 2040,
    tempDelta: null, // computed dynamically from climate.deltas
    rainPct: null,
  },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Perturbs the site's NASA POWER climate object to simulate future temperature,
 * rainfall, and root-zone soil moisture conditions.
 * When a soil model trained on this field's NASA history is available, root-zone moisture
 * comes from it; otherwise a simple rule of thumb is used.
 */
function buildSimulatedClimate(climate, tempDeltaC, rainDeltaPct, soilModel = null) {
  const base = climate.recent5Yr;
  const rainFactor = Math.max(0.2, 1 + rainDeltaPct / 100);
  // Rule of thumb: warmer air increases evapotranspiration, slightly drying root-zone moisture even at constant rain
  const evapMoistureFactor = clamp(1 + rainDeltaPct / 140 - tempDeltaC * 0.025, 0.25, 1.35);
  const learnedGwet = soilModel ? simulateSoil(soilModel, base.monthly, tempDeltaC, rainDeltaPct) : null;

  const simMonthly = base.monthly.map((m, i) => ({
    ...m,
    temp: Math.round((m.temp + tempDeltaC) * 10) / 10,
    minTemp: Math.round((m.minTemp + tempDeltaC * 0.95) * 10) / 10,
    maxTemp: Math.round((m.maxTemp + tempDeltaC * 1.1) * 10) / 10,
    rainMm: Math.round(m.rainMm * rainFactor * 10) / 10,
    gwetRoot: learnedGwet
      ? Math.round(learnedGwet[i] * 100) / 100
      : Math.round(clamp(m.gwetRoot * evapMoistureFactor, 0.05, 1.0) * 100) / 100,
  }));
  const avgGwet = learnedGwet
    ? learnedGwet.reduce((s, v) => s + v, 0) / learnedGwet.length
    : clamp(base.avgGwetRoot * evapMoistureFactor, 0.05, 1.0);

  return {
    ...climate,
    recent5Yr: {
      ...base,
      avgTempC: Math.round((base.avgTempC + tempDeltaC) * 10) / 10,
      annualRainMm: Math.round(base.annualRainMm * rainFactor),
      avgGwetRoot: Math.round(avgGwet * 100) / 100,
      monthly: simMonthly,
    },
  };
}

export default function FutureSimulatorTab({
  crops,
  climate,
  baselineSequence,
  rotationLength = 3,
  waterSupply = 'rainfed',
  elevationM = null,
  overrides,
}) {
  const [scenarioId, setScenarioId] = useState('2040_ssp245');
  const [customTemp, setCustomTemp] = useState(1.5);
  const [customRain, setCustomRain] = useState(-3);

  // Local statistical trend extrapolation (15-yr forward projection from 20-yr vs 5-yr NASA shift)
  const extrapolated = useMemo(() => {
    const rawT = (climate?.deltas?.tempDeltaC ?? 0.6) * 2.2;
    const rawR = (climate?.deltas?.rainDeltaPct ?? 0) * 1.5;
    return {
      tempDelta: Math.round(clamp(rawT, 0.5, 4.0) * 10) / 10,
      rainPct: Math.round(clamp(rawR, -30, 25)),
    };
  }, [climate]);

  const handleSelectScenario = (sc) => {
    setScenarioId(sc.id);
    if (sc.id === 'local_trend') {
      setCustomTemp(extrapolated.tempDelta);
      setCustomRain(extrapolated.rainPct);
    } else {
      setCustomTemp(sc.tempDelta);
      setCustomRain(sc.rainPct);
    }
  };

  // Hidden soil-moisture model trained on this field's NASA POWER history (null if data are too thin)
  const soilModel = useMemo(() => {
    if (!climate || climate.isFallback) return null;
    const model = trainSoilModel(climate.monthlySeries);
    return isUsable(model) ? model : null;
  }, [climate]);

  const simClimate = useMemo(
    () => buildSimulatedClimate(climate, customTemp, customRain, soilModel),
    [climate, customTemp, customRain, soilModel]
  );

  // Score crops today vs under future simulated climate
  const currentScores = useMemo(
    () => Object.fromEntries(scoreAllCrops(crops, climate, { waterSupply }).map((x) => [x.crop.id, x.score])),
    [crops, climate, waterSupply]
  );

  const futureRanked = useMemo(
    () => scoreAllCrops(crops, simClimate, { waterSupply }),
    [crops, simClimate, waterSupply]
  );

  // Identify crops that lose the most suitability vs top future performers
  const { atRiskCrops, topFutureCrops } = useMemo(() => {
    const diffs = futureRanked.map(({ crop, score }) => {
      const nowScore = currentScores[crop.id]?.envScore ?? 0;
      const futScore = score.envScore;
      return {
        crop,
        nowScore,
        futScore,
        delta: futScore - nowScore,
        heatShockMonths: score.heatShockMonths,
        limitingFactor: score.limitingFactor,
      };
    });

    const atRisk = diffs
      .filter((d) => d.nowScore >= 55 && d.delta <= -8)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 4);

    const winners = diffs.slice(0, 4);
    return { atRiskCrops: atRisk, topFutureCrops: winners };
  }, [futureRanked, currentScores]);

  // Simulate future rotation performance
  const futureRotationPlan = useMemo(() => {
    const res = generateRotations(crops, simClimate, {
      currentCropId: baselineSequence[0],
      baselineSequence,
      rotationLength,
      waterSupply,
      elevationM,
      overrides,
    });
    // Same pick as the Rotation tab's default "All-Round Balance" goal
    return { baseline: res.baseline, recommended: res.balanced ?? res.adapted[0] };
  }, [crops, simClimate, baselineSequence, rotationLength, waterSupply, elevationM, overrides]);

  const cropNameById = useMemo(
    () => Object.fromEntries(crops.map((c) => [c.id, shortCropName(c)])),
    [crops]
  );

  // One plain verdict: will the soil be short of water, when, and what to do about it
  const waterRisk = useMemo(() => {
    if (!soilModel) return null;
    const baseMonthly = climate.recent5Yr.monthly;
    const growing = Object.fromEntries(futureRanked.map(({ crop, score }) => [crop.id, score.growingMonths ?? []]));
    const plan = baselineSequence.map((id) => ({
      name: cropNameById[id] ?? id,
      months: (growing[id] ?? []).map((m) => MONTH_NAMES.indexOf(m)).filter((i) => i >= 0),
    }));
    const lowWaterAlternatives = futureRanked
      .filter(({ crop, score }) => crop.waterUse === 'low' && score.envScore >= 60 && !baselineSequence.includes(crop.id))
      .map(({ crop }) => cropNameById[crop.id]);
    return assessWaterRisk({
      model: soilModel,
      baseMonthly,
      simGwet: simulateSoil(soilModel, baseMonthly, customTemp, customRain),
      tempDeltaC: customTemp,
      rainDeltaPct: customRain,
      plan,
      lowWaterAlternatives,
      waterSupply,
    });
  }, [soilModel, climate, futureRanked, baselineSequence, cropNameById, customTemp, customRain, waterSupply]);

  const futureHeatMonths = useMemo(
    () => simClimate.recent5Yr.monthly.filter((m) => m.maxTemp > 34).length,
    [simClimate]
  );

  return (
    <div className="space-y-6">
      {/* Step 1: Scenario Presets + Interactive Climate Stress Sliders */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600">
            <TrendingUp className="h-4 w-4" /> Climate &amp; Crop Future Simulator
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            Step 1: Test Future Weather Scenarios on Your Farm
          </h2>
          <p className="text-xs text-slate-500">
            Pick a climate projection below or move the sliders to see which of your crops struggle in hotter, drier years—and which replacements thrive.
          </p>
        </div>

        {/* Scenario Buttons */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((sc) => {
            const active = scenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleSelectScenario(sc)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  active
                    ? 'border-purple-600 bg-purple-600 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-bold leading-tight">{sc.label}</div>
                <div className={`mt-1 text-xs ${active ? 'text-purple-100' : 'text-slate-500'}`}>
                  {sc.id === 'local_trend'
                    ? `+${extrapolated.tempDelta}°C · ${extrapolated.rainPct >= 0 ? '+' : ''}${extrapolated.rainPct}% rain`
                    : sc.subtitle}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Sliders + Simulated Weather Summary */}
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-12">
          <div className="space-y-1 lg:col-span-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Temperature Change</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-amber-700 ring-1 ring-slate-200">
                {customTemp >= 0 ? `+${customTemp.toFixed(1)}` : customTemp.toFixed(1)}°C
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={4.5}
              step={0.1}
              value={customTemp}
              onChange={(e) => {
                setScenarioId('custom');
                setCustomTemp(parseFloat(e.target.value));
              }}
              className="w-full accent-amber-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Today (+0°C)</span>
              <span>+2.0°C</span>
              <span>Extreme (+4.5°C)</span>
            </div>
          </div>

          <div className="space-y-1 lg:col-span-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Annual Rainfall Change</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-sky-700 ring-1 ring-slate-200">
                {customRain >= 0 ? `+${customRain}` : customRain}%
              </span>
            </div>
            <input
              type="range"
              min={-35}
              max={25}
              step={1}
              value={customRain}
              onChange={(e) => {
                setScenarioId('custom');
                setCustomRain(parseInt(e.target.value, 10));
              }}
              className="w-full accent-sky-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Severe Drought (-35%)</span>
              <span>0%</span>
              <span>Wetter (+25%)</span>
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-lg bg-white p-3 ring-1 ring-slate-200/80 lg:col-span-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Simulated Field Conditions
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-700">
              <span>
                Avg Temp: <strong>{simClimate.recent5Yr.avgTempC}°C</strong>
              </span>
              <span>·</span>
              <span>
                Rain: <strong>{simClimate.recent5Yr.annualRainMm} mm/yr</strong>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                <Flame className="h-3.5 w-3.5" /> {futureHeatMonths} hot mo/yr
              </span>
            </div>
          </div>
        </div>

        {waterRisk && <WaterRiskCard risk={waterRisk} />}
      </section>

      {/* Step 2: Crops at Risk vs. Best Future Replacements */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: Crops Losing Suitability */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600">
            <AlertTriangle className="h-4 w-4" /> Vulnerable Under This Scenario
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">Crops Losing Weather Fit</h3>
          <p className="mb-4 text-xs text-slate-500">
            Crops that grow well today but drop sharply if temperatures and rainfall shift this way.
          </p>

          {atRiskCrops.length > 0 ? (
            <div className="space-y-2.5">
              {atRiskCrops.map((item) => (
                <div
                  key={item.crop.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-rose-200/70 bg-rose-50/40 px-3.5 py-2.5"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">{shortCropName(item.crop)}</div>
                    <div className="text-[11px] text-slate-500">
                      Main stress: {item.limitingFactor}
                      {item.heatShockMonths > 0 ? ` · ${item.heatShockMonths} heat-shock mo` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="text-slate-500">{item.nowScore}%</span>
                    <span className="text-slate-300">→</span>
                    <span className="font-extrabold text-rose-700">{item.futScore}%</span>
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                      <ArrowDown className="h-3 w-3" /> {Math.abs(item.delta)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              None of your locally adapted crops suffer major suitability drops under this mild shift. Try increasing temperature to <strong>+2.5°C</strong> to stress-test heat tolerance.
            </div>
          )}
        </section>

        {/* Right: Top Future-Adapted Crops */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
            <Sparkles className="h-4 w-4" /> Climate-Resilient Picks
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">Best Crops for Future Conditions</h3>
          <p className="mb-4 text-xs text-slate-500">
            Highest-scoring crops under your simulated future temperature and moisture profile.
          </p>

          <div className="space-y-2.5">
            {topFutureCrops.map((item, idx) => (
              <div
                key={item.crop.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-xs font-bold text-white">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{shortCropName(item.crop)}</div>
                    <div className="text-[11px] text-slate-500">
                      {item.crop.waterUse} water need · {item.crop.botanicalFamily}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="text-slate-500">Today {item.nowScore}%</span>
                  <span className="text-slate-300">→</span>
                  <span className="font-extrabold text-emerald-700">{item.futScore}%</span>
                  {item.delta > 0 && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      <ArrowUp className="h-3 w-3" /> +{item.delta}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Step 3: Future-Proof Rotation Comparison */}
      {futureRotationPlan.recommended && (
        <section className="rounded-2xl border-2 border-purple-500/70 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Step 2: Future-Proof Rotation Plan
              </span>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                How Your Rotation Adapts Under {customTemp >= 0 ? `+${customTemp.toFixed(1)}°C` : `${customTemp.toFixed(1)}°C`} &amp; {customRain >= 0 ? `+${customRain}%` : `${customRain}%`} Rain
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
              <CheckCircle2 className="h-3.5 w-3.5" /> Climate-Adapted Sequence
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Your Current Plan (In Future Weather)
              </div>
              <div className="mt-2 space-y-1.5">
                {futureRotationPlan.baseline.sequence.map((id, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200/80">
                    <span className="font-semibold text-slate-800">
                      Season {i + 1}: {cropNameById[id]}
                    </span>
                    <span className="font-mono text-slate-500">
                      Fit {futureRotationPlan.baseline.perSeason[i].envScore}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Suggested Future-Adapted Plan
              </div>
              <div className="mt-2 space-y-1.5">
                {futureRotationPlan.recommended.sequence.map((id, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-emerald-200">
                    <span className="font-bold text-slate-900">
                      Season {i + 1}: {cropNameById[id]}
                    </span>
                    <span className="font-mono font-bold text-emerald-700">
                      Fit {futureRotationPlan.recommended.perSeason[i].envScore}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}