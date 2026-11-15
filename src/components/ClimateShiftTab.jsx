import { useState } from 'react';
import { CloudSun, Droplets, Flame, Thermometer, Wind } from 'lucide-react';
import { MONTH_NAMES } from '../utils/nasaApi.js';

function LineComparisonChart({
  title,
  unit,
  subtitle,
  baseSeries,
  recentSeries,
  minVal,
  maxVal,
  ticks,
  colorHex,
  recentLabel = 'Recent 5-Yr',
  baseLabel = '20-Yr Baseline',
  decimals = 1,
  thresholdVal = null,
  thresholdLabel = '',
}) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const W = 580;
  const H = 200;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const range = maxVal - minVal || 1;

  const getX = (i) => PAD_L + (i / 11) * plotW;
  const getY = (v) => PAD_T + plotH - ((Math.min(maxVal, Math.max(minVal, v)) - minVal) / range) * plotH;

  const basePts = baseSeries.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
  const recentPts = recentSeries.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

  const activeIdx = hoverIdx !== null ? hoverIdx : null;
  const activeBase = activeIdx !== null ? baseSeries[activeIdx] : null;
  const activeRec = activeIdx !== null ? recentSeries[activeIdx] : null;
  const activeDiff = activeIdx !== null ? activeRec - activeBase : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      {/* Header with Live Hover Readout */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>

        {activeIdx !== null ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs tabular-nums">
            <span className="font-bold text-slate-800">{MONTH_NAMES[activeIdx]}:</span>
            <span className="text-slate-500">
              Base <strong>{activeBase.toFixed(decimals)}{unit}</strong>
            </span>
            <span className="text-slate-300">→</span>
            <span className="font-bold" style={{ color: colorHex }}>
              {activeRec.toFixed(decimals)}{unit}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                activeDiff > 0
                  ? 'bg-amber-100 text-amber-800'
                  : activeDiff < 0
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {activeDiff > 0 ? `+${activeDiff.toFixed(decimals)}` : activeDiff.toFixed(decimals)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="inline-block w-3 border-t-2 border-dashed border-slate-400" /> {baseLabel}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-800">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorHex }} /> {recentLabel}
            </span>
          </div>
        )}
      </div>

      {/* SVG Plot with Y-Axis Labels & Hover Columns */}
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full select-none overflow-visible">
          {/* Horizontal gridlines + Y-axis labels */}
          {ticks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text
                  x={PAD_L - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10.5"
                  className="font-mono"
                >
                  {t}
                  {unit}
                </text>
              </g>
            );
          })}

          {/* Optional Heat-Stress Threshold Line */}
          {thresholdVal !== null && thresholdVal >= minVal && thresholdVal <= maxVal && (
            <g>
              <line
                x1={PAD_L}
                y1={getY(thresholdVal)}
                x2={W - PAD_R}
                y2={getY(thresholdVal)}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={W - PAD_R}
                y={getY(thresholdVal) - 4}
                textAnchor="end"
                fill="#e11d48"
                fontSize="9.5"
                fontWeight="600"
              >
                {thresholdLabel}
              </text>
            </g>
          )}

          {/* Baseline Dashed Line */}
          <polyline
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="4 4"
            points={basePts}
          />

          {/* Recent Solid Line */}
          <polyline fill="none" stroke={colorHex} strokeWidth="2.75" points={recentPts} />

          {/* Active Hover Vertical Guide */}
          {activeIdx !== null && (
            <line
              x1={getX(activeIdx)}
              y1={PAD_T}
              x2={getX(activeIdx)}
              y2={H - PAD_B}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Data Points + Month X-Axis Labels + Invisible Hover Hit Zones */}
          {MONTH_NAMES.map((m, i) => {
            const x = getX(i);
            const yRec = getY(recentSeries[i]);
            const yBase = getY(baseSeries[i]);
            const isHovered = activeIdx === i;
            const colW = plotW / 12;

            return (
              <g
                key={m}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                className="cursor-crosshair"
              >
                {/* Baseline dot */}
                <circle cx={x} cy={yBase} r={isHovered ? 4 : 2.2} fill="#94a3b8" />
                {/* Recent dot */}
                <circle
                  cx={x}
                  cy={yRec}
                  r={isHovered ? 5.5 : 3.2}
                  fill={colorHex}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />

                {/* Month label */}
                <text
                  x={x}
                  y={H - 8}
                  textAnchor="middle"
                  fill={isHovered ? '#0f172a' : '#64748b'}
                  fontWeight={isHovered ? '700' : '500'}
                  fontSize="11"
                >
                  {m}
                </text>

                {/* Full-column hover hit target */}
                <rect
                  x={x - colW / 2}
                  y={PAD_T}
                  width={colW}
                  height={plotH + PAD_B}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function PrecipitationBarChart({ baseMonthly, recentMonthly }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const rawMax = Math.max(
    ...recentMonthly.map((m) => m.rainMm),
    ...baseMonthly.map((m) => m.rainMm),
    60
  );
  // Round ceiling up to a clean multiple of 50mm
  const maxVal = Math.ceil(rawMax / 50) * 50;
  const ticks = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];

  const W = 580;
  const H = 200;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const getY = (v) => PAD_T + plotH - (v / maxVal) * plotH;

  const activeBase = hoverIdx !== null ? baseMonthly[hoverIdx].rainMm : null;
  const activeRec = hoverIdx !== null ? recentMonthly[hoverIdx].rainMm : null;
  const activeDiff = hoverIdx !== null ? activeRec - activeBase : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Monthly Precipitation (mm)</h3>
          <p className="text-xs text-slate-500">Hover any month to compare rainfall volume</p>
        </div>

        {hoverIdx !== null ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs tabular-nums">
            <span className="font-bold text-slate-800">{MONTH_NAMES[hoverIdx]}:</span>
            <span className="text-slate-500">
              Base <strong>{Math.round(activeBase)} mm</strong>
            </span>
            <span className="text-slate-300">→</span>
            <span className="font-bold text-sky-700">{Math.round(activeRec)} mm</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                activeDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {activeDiff >= 0 ? `+${Math.round(activeDiff)}` : Math.round(activeDiff)} mm
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" /> 20-Yr Baseline
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-sky-700">
              <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" /> Recent 5-Yr
            </span>
          </div>
        )}
      </div>

      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full select-none overflow-visible">
          {ticks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text
                  x={PAD_L - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10.5"
                  className="font-mono"
                >
                  {t}
                </text>
              </g>
            );
          })}

          {MONTH_NAMES.map((m, i) => {
            const slotW = plotW / 12;
            const centerX = PAD_L + slotW * (i + 0.5);
            const barW = Math.min(12, slotW * 0.34);
            const baseVal = baseMonthly[i].rainMm;
            const recVal = recentMonthly[i].rainMm;
            const baseH = (baseVal / maxVal) * plotH;
            const recH = (recVal / maxVal) * plotH;
            const isHovered = hoverIdx === i;

            return (
              <g
                key={m}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                className="cursor-crosshair"
              >
                {isHovered && (
                  <rect
                    x={centerX - slotW / 2 + 2}
                    y={PAD_T}
                    width={slotW - 4}
                    height={plotH}
                    fill="#f1f5f9"
                    rx="4"
                  />
                )}
                {/* Baseline Bar */}
                <rect
                  x={centerX - barW - 1}
                  y={PAD_T + plotH - baseH}
                  width={barW}
                  height={Math.max(2, baseH)}
                  fill={isHovered ? '#94a3b8' : '#cbd5e1'}
                  rx="2"
                />
                {/* Recent Bar */}
                <rect
                  x={centerX + 1}
                  y={PAD_T + plotH - recH}
                  width={barW}
                  height={Math.max(2, recH)}
                  fill={isHovered ? '#0369a1' : '#0284c7'}
                  rx="2"
                />
                <text
                  x={centerX}
                  y={H - 8}
                  textAnchor="middle"
                  fill={isHovered ? '#0f172a' : '#64748b'}
                  fontWeight={isHovered ? '700' : '500'}
                  fontSize="11"
                >
                  {m}
                </text>
                <rect
                  x={centerX - slotW / 2}
                  y={PAD_T}
                  width={slotW}
                  height={plotH + PAD_B}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function ClimateShiftTab({ climate }) {
  if (!climate || !climate.baseline20Yr || !climate.recent5Yr) return null;

  const { baseline20Yr, recent5Yr, deltas } = climate;
  const baseMonthly = baseline20Yr.monthly;
  const recentMonthly = recent5Yr.monthly;

  // Dynamic temperature bounds so tropical & temperate climates both fill the chart cleanly
  const allTemps = [...baseMonthly.map((m) => m.temp), ...recentMonthly.map((m) => m.temp)];
  const tempMin = Math.floor((Math.min(...allTemps) - 3) / 5) * 5;
  const tempMax = Math.ceil((Math.max(...allTemps) + 3) / 5) * 5;
  const tempTicks = Array.from({ length: 5 }, (_, idx) =>
    Math.round(tempMin + ((tempMax - tempMin) / 4) * idx)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-600">
              <CloudSun className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">NASA POWER Satellite Climatology</span>
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Climate Shift &amp; Trend Analysis</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Comparing 20-year baseline ({climate.dataYears.baseline[0]}–{climate.dataYears.baseline[1]}) against recent 5-year shifts ({climate.dataYears.recent[0]}–{climate.dataYears.recent[1]}).
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
            <span className="font-mono text-xs font-semibold text-slate-700">
              Lat {climate.lat.toFixed(2)}°, Lon {climate.lon.toFixed(2)}°
            </span>
          </div>
        </div>

        {/* Headline Delta Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Mean Temp Shift</span>
              <Thermometer className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                {deltas.tempDeltaC > 0 ? `+${deltas.tempDeltaC}` : deltas.tempDeltaC}°C
              </span>
              <span className="text-xs text-slate-500">Recent vs 20-yr</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Baseline: {baseline20Yr.avgTempC}°C → Recent: {recent5Yr.avgTempC}°C
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Annual Rainfall Shift</span>
              <Droplets className="h-4 w-4 text-sky-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                {deltas.rainDeltaPct > 0 ? `+${deltas.rainDeltaPct}` : deltas.rainDeltaPct}%
              </span>
              <span className="text-xs text-slate-500">Total volume</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Baseline: {Math.round(baseline20Yr.annualRainMm)} mm → Recent: {Math.round(recent5Yr.annualRainMm)} mm
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Root-Zone Wetness</span>
              <Wind className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                {deltas.gwetDelta > 0 ? `+${deltas.gwetDelta}` : deltas.gwetDelta}
              </span>
              <span className="text-xs text-slate-500">GWET index</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Baseline: {baseline20Yr.avgGwetRoot} → Recent: {recent5Yr.avgGwetRoot}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Heat Stress Months</span>
              <Flame className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                {deltas.heatStressMonths} mo/yr
              </span>
              <span className="text-xs text-slate-500">&gt;34°C max</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Flowering &amp; grain-fill vulnerability</div>
          </div>
        </div>
      </div>

      {/* Visualizations Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LineComparisonChart
          title="Monthly Mean Temperature (°C)"
          unit="°"
          subtitle="Hover any month to inspect exact temperature shift"
          baseSeries={baseMonthly.map((m) => m.temp)}
          recentSeries={recentMonthly.map((m) => m.temp)}
          minVal={tempMin}
          maxVal={tempMax}
          ticks={tempTicks}
          colorHex="#059669"
          decimals={1}
        />

        <PrecipitationBarChart baseMonthly={baseMonthly} recentMonthly={recentMonthly} />

        <LineComparisonChart
          title="Root-Zone Soil Moisture Index (GWETRoot)"
          unit=""
          subtitle="0.0 (wilting dry) to 1.0 (saturated root zone)"
          baseSeries={baseMonthly.map((m) => m.gwetRoot)}
          recentSeries={recentMonthly.map((m) => m.gwetRoot)}
          minVal={0}
          maxVal={1}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          colorHex="#0284c7"
          decimals={2}
        />

        <LineComparisonChart
          title="Surface Solar Radiation (kWh/m²/day)"
          unit=""
          subtitle="Incident shortwave energy available for photosynthesis"
          baseSeries={baseMonthly.map((m) => m.solar)}
          recentSeries={recentMonthly.map((m) => m.solar)}
          minVal={0}
          maxVal={28}
          ticks={[0, 7, 14, 21, 28]}
          colorHex="#d97706"
          decimals={1}
        />
      </div>
    </div>
  );
}