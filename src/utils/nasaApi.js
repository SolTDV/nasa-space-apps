// NASA POWER client: one live call, 2006-2025 monthly data, 20-yr baseline vs. recent 5-yr.

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const BASELINE_START_YEAR = 2006;
export const END_YEAR = 2025;
export const RECENT_START_YEAR = 2021; // most recent 5 available years: 2021-2025
export const HEAT_STRESS_MAX_TEMP_C = 34;
export const REQUEST_TIMEOUT_MS = 8000;

// PRECTOTCORR in NASA POWER monthly "ag" output is mm/day -> approx. mm/month.
const DAYS_PER_MONTH = 30.4;

const PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETROOT', 'ALLSKY_SFC_SW_DWN'];

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

export function buildNasaUrl(lat, lon) {
  const la = Number(lat).toFixed(4);
  const lo = Number(lon).toFixed(4);
  return (
    'https://power.larc.nasa.gov/api/temporal/monthly/point' +
    `?parameters=${PARAMS.join(',')}&community=ag&longitude=${lo}&latitude=${la}` +
    `&start=${BASELINE_START_YEAR}&end=${END_YEAR}&format=JSON`
  );
}

// ---------- Period summarising (shared by live parsing and fallback) ----------

function summarizePeriod(monthly) {
  return {
    avgTempC: r2(mean(monthly.map((m) => m.temp))),
    maxTempC: r2(mean(monthly.map((m) => m.maxTemp))),
    minTempC: r2(mean(monthly.map((m) => m.minTemp))),
    annualRainMm: r1(monthly.reduce((s, m) => s + m.rainMm, 0)),
    avgGwetRoot: r3(mean(monthly.map((m) => m.gwetRoot))),
    avgSolar: r2(mean(monthly.map((m) => m.solar))),
    monthly,
  };
}

function computeDeltas(baseline20Yr, recent5Yr) {
  const rainBase = baseline20Yr.annualRainMm;
  return {
    tempDeltaC: r2(recent5Yr.avgTempC - baseline20Yr.avgTempC),
    maxTempDeltaC: r2(recent5Yr.maxTempC - baseline20Yr.maxTempC),
    rainDeltaPct: rainBase > 0 ? r1(((recent5Yr.annualRainMm - rainBase) / rainBase) * 100) : 0,
    gwetDelta: r3(recent5Yr.avgGwetRoot - baseline20Yr.avgGwetRoot),
    heatStressMonths: recent5Yr.monthly.filter((m) => m.maxTemp > HEAT_STRESS_MAX_TEMP_C).length,
  };
}

function assembleClimate({ lat, lon, baseline20Yr, recent5Yr, isFallback, extra = {} }) {
  return {
    isWaterBody: false,
    isFallback,
    lat,
    lon,
    baseline20Yr,
    recent5Yr,
    deltas: computeDeltas(baseline20Yr, recent5Yr),
    dataYears: { baseline: [BASELINE_START_YEAR, END_YEAR], recent: [RECENT_START_YEAR, END_YEAR] },
    ...extra,
  };
}

// ---------- Parsing ----------

const emptyBuckets = () =>
  Object.fromEntries(PARAMS.map((p) => [p, Array.from({ length: 12 }, () => [])]));

// Replace months with no valid data by the mean of the months that do have data.
function fillGaps(values) {
  const valid = values.filter((v) => v !== null);
  if (!valid.length) return null;
  const fallback = mean(valid);
  return values.map((v) => (v === null ? fallback : v));
}

function bucketsToMonthly(b) {
  const series = {};
  for (const p of PARAMS) {
    const filled = fillGaps(b[p].map((vals) => mean(vals)));
    if (!filled) return null; // a parameter has no valid values at all
    series[p] = filled;
  }
  return MONTH_NAMES.map((month, i) => ({
    month,
    temp: r2(series.T2M[i]),
    maxTemp: r2(series.T2M_MAX[i]),
    minTemp: r2(series.T2M_MIN[i]),
    rainMm: r1(series.PRECTOTCORR[i] * DAYS_PER_MONTH),
    gwetRoot: r3(Math.min(1, Math.max(0, series.GWETROOT[i]))),
    solar: r2(series.ALLSKY_SFC_SW_DWN[i]),
  }));
}

/**
 * Parse a raw NASA POWER JSON response.
 * - Keys are "YYYYMM"; "YYYY13" annual summaries are ignored.
 * - -999 (fill value) is filtered out. If temperature or root-zone wetness has no
 *   valid data at all (e.g. open ocean), returns { isWaterBody: true }.
 */
export function parseNasaResponse(json, lat, lon) {
  const param = json?.properties?.parameter;
  if (!param || typeof param !== 'object') {
    throw new Error('Unexpected NASA POWER response shape');
  }

  const baseBuckets = emptyBuckets();
  const recentBuckets = emptyBuckets();
  // Month-by-month history (not just averages), used to train the hidden soil-moisture model
  const monthlySeries = [];

  const keys = Object.keys(param.T2M ?? param[PARAMS[0]] ?? {});
  for (const key of keys) {
    if (!/^\d{6}$/.test(key)) continue;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4));
    if (month < 1 || month > 12) continue; // drops YYYY13 annual keys
    if (year < BASELINE_START_YEAR || year > END_YEAR) continue;

    for (const p of PARAMS) {
      const v = param[p]?.[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= -998) continue;
      baseBuckets[p][month - 1].push(v);
      if (year >= RECENT_START_YEAR) recentBuckets[p][month - 1].push(v);
    }

    const valid = (p) => {
      const v = param[p]?.[key];
      return typeof v === 'number' && Number.isFinite(v) && v > -998 ? v : null;
    };
    const rainPerDay = valid('PRECTOTCORR');
    monthlySeries.push({
      year,
      month,
      temp: valid('T2M'),
      rainMm: rainPerDay === null ? null : rainPerDay * DAYS_PER_MONTH,
      gwetRoot: valid('GWETROOT'),
    });
  }

  const hasData = (b, p) => b[p].some((vals) => vals.length > 0);
  if (!hasData(baseBuckets, 'T2M') || !hasData(baseBuckets, 'GWETROOT')) {
    return { isWaterBody: true, isFallback: false, lat, lon };
  }

  const baseMonthly = bucketsToMonthly(baseBuckets);
  if (!baseMonthly) return { isWaterBody: true, isFallback: false, lat, lon };

  // If the recent window lacks data for some parameter, reuse the baseline for it.
  const recentMonthly = bucketsToMonthly(recentBuckets) ?? baseMonthly;

  return assembleClimate({
    lat,
    lon,
    baseline20Yr: summarizePeriod(baseMonthly),
    recent5Yr: summarizePeriod(recentMonthly),
    isFallback: false,
    extra: { source: 'NASA POWER (live)', monthlySeries },
  });
}

// ---------- Hardcoded fallback (illustrative regional climatologies) ----------

const FALLBACK_PROFILES = [
  {
    id: 'iowa',
    region: 'US Corn Belt (Iowa)',
    lat: 42.03,
    lon: -93.63,
    temp: [-7, -4, 3, 10, 16.5, 21.5, 23.5, 22.5, 18, 11, 3, -4],
    maxTemp: [-1.5, 1, 8, 16, 22.5, 27.5, 29.5, 28.5, 24.5, 17.5, 8.5, 1],
    minTemp: [-12.5, -9, -2, 4, 10.5, 16, 18, 17, 12, 5, -2.5, -9.5],
    rainMm: [28, 30, 60, 95, 120, 130, 115, 115, 90, 70, 50, 35],
    gwetRoot: [0.62, 0.62, 0.68, 0.72, 0.74, 0.72, 0.66, 0.62, 0.6, 0.62, 0.64, 0.63],
    solar: [5.5, 8, 11.5, 15.5, 19.5, 22, 21.5, 18.5, 14, 9.5, 5.5, 4.5],
    shift: { dTempC: 0.6, rainPct: 4, dGwet: 0.01 },
  },
  {
    id: 'kansas',
    region: 'US High Plains (Western Kansas)',
    lat: 38.48,
    lon: -100.9,
    temp: [-1, 1.5, 6.5, 12, 17.5, 23, 26, 25, 20, 13, 6, 0],
    maxTemp: [6.5, 9, 15, 20.5, 25.5, 31.5, 34.5, 33.5, 28.5, 21.5, 13.5, 7],
    minTemp: [-8, -6, -2, 3.5, 9.5, 15, 18, 17, 11, 4, -1.5, -7],
    rainMm: [10, 12, 30, 45, 80, 85, 75, 70, 40, 38, 16, 12],
    gwetRoot: [0.38, 0.38, 0.38, 0.38, 0.4, 0.4, 0.36, 0.34, 0.32, 0.34, 0.36, 0.37],
    solar: [7, 10, 14, 18, 21, 24, 24, 21, 16.5, 12, 8, 6.5],
    shift: { dTempC: 0.7, rainPct: -3, dGwet: -0.01 },
  },
  {
    id: 'mekong',
    region: 'Mekong Delta (Vietnam)',
    lat: 10.05,
    lon: 105.75,
    temp: [25.5, 26.2, 27.3, 28.3, 28.2, 27.6, 27.3, 27.3, 27.3, 27.2, 26.8, 25.8],
    maxTemp: [31.5, 32.5, 34, 34.8, 33.5, 32, 31.5, 31.5, 31.5, 31.5, 31.5, 30.8],
    minTemp: [22, 22.5, 23.5, 24.8, 25.2, 25, 24.8, 24.8, 24.8, 24.5, 23.8, 22.5],
    rainMm: [7, 4, 15, 65, 180, 210, 215, 225, 270, 260, 120, 35],
    gwetRoot: [0.62, 0.55, 0.5, 0.5, 0.6, 0.72, 0.78, 0.8, 0.85, 0.85, 0.78, 0.7],
    solar: [17.5, 19.5, 21, 21, 18.5, 17.5, 17.5, 17.5, 16.5, 16.5, 16.5, 16.5],
    shift: { dTempC: 0.5, rainPct: 2, dGwet: 0 },
  },
];

function distanceScore(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)); // great-circle angle, enough to rank proximity
}

/** Realistic hardcoded climate (nearest of three regional profiles). */
export function getFallbackClimate(lat, lon, reason = 'NASA POWER unavailable') {
  const profile = FALLBACK_PROFILES.reduce((best, p) =>
    distanceScore(lat, lon, p.lat, p.lon) < distanceScore(lat, lon, best.lat, best.lon) ? p : best
  );
  const baseMonthly = MONTH_NAMES.map((month, i) => ({
    month,
    temp: profile.temp[i],
    maxTemp: profile.maxTemp[i],
    minTemp: profile.minTemp[i],
    rainMm: profile.rainMm[i],
    gwetRoot: profile.gwetRoot[i],
    solar: profile.solar[i],
  }));
  const { dTempC, rainPct, dGwet } = profile.shift;
  const recentMonthly = baseMonthly.map((m) => ({
    month: m.month,
    temp: r2(m.temp + dTempC),
    maxTemp: r2(m.maxTemp + dTempC),
    minTemp: r2(m.minTemp + dTempC),
    rainMm: r1(m.rainMm * (1 + rainPct / 100)),
    gwetRoot: r3(Math.min(1, Math.max(0, m.gwetRoot + dGwet))),
    solar: m.solar,
  }));

  return assembleClimate({
    lat,
    lon,
    baseline20Yr: summarizePeriod(baseMonthly),
    recent5Yr: summarizePeriod(recentMonthly),
    isFallback: true,
    extra: {
      source: 'Hardcoded regional fallback (illustrative, not live NASA data)',
      fallbackRegion: profile.region,
      fallbackReason: reason,
    },
  });
}

// ---------- Public API ----------

/**
 * Fetch and parse NASA POWER climate for a point.
 * Never rejects: network errors, timeouts (8 s) and malformed responses return a fallback.
 */
export async function fetchFarmClimate(lat, lon) {
  const latN = Number(lat);
  const lonN = Number(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN) || Math.abs(latN) > 90 || Math.abs(lonN) > 180) {
    return getFallbackClimate(latN || 0, lonN || 0, 'Invalid coordinates');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildNasaUrl(latN, lonN), { signal: controller.signal });
    if (!res.ok) throw new Error(`NASA POWER returned HTTP ${res.status}`);
    const json = await res.json();
    return parseNasaResponse(json, latN, lonN);
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : err?.message;
    return getFallbackClimate(latN, lonN, reason || 'NASA POWER unavailable');
  } finally {
    clearTimeout(timer);
  }
}
