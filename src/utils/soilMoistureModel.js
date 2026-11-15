// Hidden soil-moisture model, trained on the farm's own NASA POWER history.
//
// What it learns (per location, in the browser, in a few milliseconds):
//   root-zone wetness anomaly (GWETROOT)  ~  rain anomaly this month
//                                          + rain anomaly 1 and 2 months earlier (soil memory)
//                                          + temperature anomaly (warmer = more evaporation)
// Anomalies are differences from that calendar month's average, so the model learns how this
// field's soil reacts when a month is wetter, drier or hotter than usual.
//
// How it is checked: leave-one-year-out. Each year is predicted by a model that never saw it.
// On real NASA POWER data (2006-2025) this explains about 50-80% of year-to-year soil-moisture
// swings (Can Tho 0.71, Ca Mau 0.61, Buon Ma Thuot 0.82, Iowa 0.48, Kansas 0.62).
// Farmers never see the score. It only decides whether the verdict is shown normally,
// labelled "rough estimate", or hidden.

import { MONTH_NAMES } from './nasaApi.js';

const MIN_YEARS = 8;
const DRY_PERCENTILE = 0.2; // "dry month" = drier than in 4 of 5 recorded years for that month
const WET_ENOUGH = 0.7; // root zone >= 70% saturated is still moist: never called dry
const GOOD_SKILL = 0.3; // share of year-to-year moisture swings explained on held-out years
const ROUGH_SKILL = 0.1;
const MIN_DROP = 0.03; // a month only counts as newly dry if wetness falls by at least 3 points

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

function quantile(values, q) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// Solve A x = b (small dense system) by Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// Ordinary least squares with intercept. rows: [{ x: [..], y }]. Returns [b0, b1, ...] or null.
function fitOLS(rows) {
  if (rows.length < 12) return null;
  const k = rows[0].x.length + 1;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (const { x, y } of rows) {
    const v = [1, ...x];
    for (let i = 0; i < k; i++) {
      Xty[i] += v[i] * y;
      for (let j = 0; j < k; j++) XtX[i][j] += v[i] * v[j];
    }
  }
  return solve(XtX, Xty);
}

const predictRow = (b, x) => b[0] + x.reduce((s, v, i) => s + b[i + 1] * v, 0);

/**
 * Train on climate.monthlySeries: [{ year, month (1-12), rainMm, temp, gwetRoot }].
 * Returns null when there is not enough usable data.
 */
export function trainSoilModel(series) {
  if (!Array.isArray(series) || !series.length) return null;
  const complete = series.filter((r) => ok(r.rainMm) && ok(r.temp) && ok(r.gwetRoot));
  const years = [...new Set(complete.map((r) => r.year))].sort((a, b) => a - b);
  if (years.length < MIN_YEARS) return null;

  // Calendar-month averages and the "dry" threshold for each month
  const byMonth = Array.from({ length: 12 }, () => ({ rain: [], temp: [], gwet: [] }));
  for (const r of complete) {
    const b = byMonth[r.month - 1];
    b.rain.push(r.rainMm);
    b.temp.push(r.temp);
    b.gwet.push(r.gwetRoot);
  }
  const climRain = byMonth.map((b) => mean(b.rain));
  const climTemp = byMonth.map((b) => mean(b.temp));
  const climGwet = byMonth.map((b) => mean(b.gwet));
  const dryLine = byMonth.map((b) => quantile(b.gwet, DRY_PERCENTILE));

  // Training rows (each month needs the two previous months' rain too)
  const byKey = new Map(complete.map((r) => [r.year * 12 + r.month - 1, r]));
  const rows = [];
  for (const r of complete) {
    const k = r.year * 12 + r.month - 1;
    const p1 = byKey.get(k - 1);
    const p2 = byKey.get(k - 2);
    if (!p1 || !p2) continue;
    const m = r.month - 1;
    const back = (n) => (m - n + 12) % 12;
    rows.push({
      year: r.year,
      x: [r.rainMm - climRain[m], p1.rainMm - climRain[back(1)], p2.rainMm - climRain[back(2)], r.temp - climTemp[m]],
      y: r.gwetRoot - climGwet[m],
    });
  }

  // Leave-one-year-out check: predict each year with a model trained on all other years
  let sse = 0;
  let sst = 0;
  const yBar = mean(rows.map((r) => r.y));
  for (const y of years) {
    const train = rows.filter((r) => r.year !== y);
    const test = rows.filter((r) => r.year === y);
    if (!test.length) continue;
    const bFold = fitOLS(train);
    if (!bFold) return null;
    for (const r of test) {
      sse += (r.y - predictRow(bFold, r.x)) ** 2;
      sst += (r.y - yBar) ** 2;
    }
  }
  const skill = sst > 0 ? 1 - sse / sst : 0;

  // Final coefficients use every year
  const b = fitOLS(rows);
  if (!b) return null;
  // Physical sanity: more rain never dries the soil, warming never wets it
  const coef = { rain: b[1], rainPrev: Math.max(0, b[2]), rainPrev2: Math.max(0, b[3]), temp: Math.min(0, b[4]) };

  let reliability = 'none';
  if (coef.rain > 0 && skill >= GOOD_SKILL) reliability = 'good';
  else if (coef.rain > 0 && skill >= ROUGH_SKILL) reliability = 'rough';

  // Driest and hottest years on record, to flag scenarios beyond anything observed
  const annual = years
    .map((y) => complete.filter((r) => r.year === y))
    .filter((rs) => rs.length === 12)
    .map((rs) => ({ rain: rs.reduce((s, r) => s + r.rainMm, 0), temp: mean(rs.map((r) => r.temp)) }));
  const meanRain = mean(annual.map((a) => a.rain));
  const meanTemp = mean(annual.map((a) => a.temp));
  const driestPct = annual.length ? Math.min(...annual.map((a) => (a.rain / meanRain - 1) * 100)) : -20;
  const hottestDelta = annual.length ? Math.max(...annual.map((a) => a.temp - meanTemp)) : 1;

  return { coef, skill, reliability, dryLine, climGwet, years: [years[0], years[years.length - 1]], driestPct, hottestDelta };
}

export const isUsable = (model) => !!model && model.reliability !== 'none';

/** Predicted monthly root-zone wetness (12 values) for a scenario applied to today's climate. */
export function simulateSoil(model, baseMonthly, tempDeltaC, rainDeltaPct) {
  const dRain = baseMonthly.map((m) => (m.rainMm * rainDeltaPct) / 100);
  return baseMonthly.map((m, i) =>
    clamp(
      m.gwetRoot +
        model.coef.rain * dRain[i] +
        model.coef.rainPrev * dRain[(i + 11) % 12] +
        model.coef.rainPrev2 * dRain[(i + 10) % 12] +
        model.coef.temp * tempDeltaC,
      0.02,
      1
    )
  );
}

// Group month indices into runs, joining Dec->Jan so a dry season like Nov–Apr stays one run
function monthRuns(indices) {
  const s = [...new Set(indices)].sort((a, b) => a - b);
  const runs = [];
  for (const i of s) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 11) {
    const tail = runs.pop();
    runs[0] = [tail[0], runs[0][1]];
  }
  return runs;
}

// "Feb–Apr", "Nov–Mar", or "Feb, Jun"
export function formatMonths(indices) {
  if (new Set(indices).size === 12) return 'all year';
  return monthRuns(indices)
    .map(([a, b]) => (a === b ? MONTH_NAMES[a] : `${MONTH_NAMES[a]}–${MONTH_NAMES[b]}`))
    .join(', ');
}

// First month of the longest dry spell (when to have water stored by)
function spellStart(indices) {
  const len = ([a, b]) => ((b - a + 12) % 12) + 1;
  const runs = monthRuns(indices);
  return runs.reduce((best, r) => (len(r) > len(best) ? r : best), runs[0])[0];
}

/**
 * Turns the hidden numbers into one plain verdict.
 * plan: [{ name, months: [0-11] }] crops in the farmer's current plan with their growing months.
 * lowWaterAlternatives: names of low-water crops that still fit the future climate.
 */
export function assessWaterRisk({ model, baseMonthly, simGwet, tempDeltaC, rainDeltaPct, plan = [], lowWaterAlternatives = [], waterSupply = 'rainfed' }) {
  const isDry = (v, i) => v < model.dryLine[i] && v < WET_ENOUGH;
  const todayDry = baseMonthly.map((m, i) => isDry(m.gwetRoot, i));
  const futureDry = simGwet.map((v, i) => isDry(v, i) && (todayDry[i] || baseMonthly[i].gwetRoot - v >= MIN_DROP));
  const newDry = futureDry.map((d, i) => (d && !todayDry[i] ? i : -1)).filter((i) => i >= 0);
  const monthFlags = futureDry.map((d, i) => (d && !todayDry[i] ? 'new' : d ? 'dry' : 'ok'));
  const change = mean(simGwet) - mean(baseMonthly.map((m) => m.gwetRoot));

  const level = newDry.length >= 3 ? 'high' : newDry.length >= 1 ? 'medium' : 'low';
  const when = formatMonths(newDry);
  let title;
  let message;
  if (level === 'high') {
    title = 'Water shortage risk';
    message = `Soil would be drier than in most years during ${when}: ${newDry.length} more dry months than today.`;
  } else if (level === 'medium') {
    title = `Watch out in ${when}`;
    message = `Soil would be drier than in most years in ${when}. Plan water for ${newDry.length === 1 ? 'that month' : 'those months'}.`;
  } else if (change < -0.01) {
    title = 'No extra dry months';
    message = 'Soil gets a little drier, but stays within its normal range all year.';
  } else {
    title = 'No extra water risk';
    message = 'Soil moisture stays within its normal range all year.';
  }

  const advice = [];
  if (level !== 'low') {
    const storeBy = MONTH_NAMES[spellStart(newDry)];
    const seen = new Set();
    for (const p of plan) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      const overlap = p.months.filter((i) => newDry.includes(i));
      if (!overlap.length) continue;
      const span = formatMonths(overlap);
      if (waterSupply === 'irrigated') {
        advice.push(`Plan extra irrigation for ${p.name} in ${span}.`);
      } else {
        const alt = lowWaterAlternatives.filter((n) => n !== p.name).slice(0, 2);
        advice.push(
          `${p.name} grows during ${span}.` +
            (alt.length ? ` Consider ${alt.join(' or ')} instead, or store water before ${storeBy}.` : ` Store water before ${storeBy}.`)
        );
      }
      if (advice.length >= 2) break;
    }
    if (!advice.length) {
      advice.push(`Your current crops avoid ${when}. Keep that gap when you plan new seasons.`);
    }
  }

  const extreme = rainDeltaPct < model.driestPct - 2 || tempDeltaC > model.hottestDelta + 1;

  return { level, title, message, advice, monthFlags, rough: model.reliability === 'rough', extreme };
}
