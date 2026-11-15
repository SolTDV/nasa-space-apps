// Pure NASA POWER crop environmental fit (no soil chemistry or market guessing),
// plus a small economics helper shared by the Economics tab and the rotation engine.
//
// Scoring is evaluated over each crop's GROWING-SEASON WINDOW (contiguous months whose
// temperatures best suit the crop), so a warm-season crop in Iowa is not judged against
// January. Rainfall is the growing-season total; GWETROOT and solar are window means.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

export const GROWING_SEASON_MONTHS = { warm: 6, cool: 7 };

export const FIT_WEIGHTS = { thermal: 0.35, rain: 0.3, rootMoisture: 0.2, solar: 0.15 };

// ---------- Component fit functions (0-100) ----------

export function thermalFitForTemp(t, optimal, lethal) {
  const [optMin, optMax] = optimal;
  const [killMin, killMax] = lethal;
  if (t >= optMin && t <= optMax) return 100;
  if (t < optMin) return clamp(((t - killMin) / (optMin - killMin)) * 100, 0, 100);
  return clamp(((killMax - t) / (killMax - optMax)) * 100, 0, 100);
}

export function rainFitForMm(rainMm, optimalMm, minMm) {
  if (rainMm >= optimalMm) return 100;
  if (rainMm >= minMm) return 30 + 70 * ((rainMm - minMm) / (optimalMm - minMm));
  return 30 * Math.pow(Math.max(rainMm, 0) / minMm, 2); // drops rapidly below the minimum
}

export function rootMoistureFit(gwet, [lo, hi]) {
  const dev = gwet < lo ? lo - gwet : gwet > hi ? gwet - hi : 0;
  if (dev === 0) return 100;
  return clamp(100 - (dev / (hi - lo)) * 100, 0, 100);
}

export function solarFit(avgSolar, optimalSolar) {
  return Math.min(100, (avgSolar / optimalSolar) * 100);
}

// ---------- Growing-season window ----------

/**
 * Best contiguous (wrap-around) window of months for a crop, by monthly thermal suitability.
 * Ties (common when temperatures saturate at 100, e.g. the tropics) go to the wetter window.
 */
export function getGrowingWindow(crop, monthly) {
  const n = GROWING_SEASON_MONTHS[crop.seasonType] ?? 6;
  const monthlyFit = monthly.map((m) => thermalFitForTemp(m.temp, crop.optimalTemp, crop.lethalTemp));
  let bestStart = 0;
  let bestTotal = -Infinity;
  let bestRain = -Infinity;
  for (let start = 0; start < 12; start++) {
    let total = 0;
    let rain = 0;
    for (let k = 0; k < n; k++) {
      total += monthlyFit[(start + k) % 12];
      rain += monthly[(start + k) % 12].rainMm;
    }
    if (total > bestTotal + 1e-6 || (Math.abs(total - bestTotal) <= 1e-6 && rain > bestRain)) {
      bestTotal = total;
      bestRain = rain;
      bestStart = start;
    }
  }
  return Array.from({ length: n }, (_, k) => (bestStart + k) % 12);
}

// ---------- Public scoring ----------

function emptyScore(crop) {
  return {
    cropId: crop.id,
    envScore: 0,
    thermalFit: 0,
    rainFit: 0,
    rootMoistureFit: 0,
    solarFit: 0,
    yieldMultiplier: 0,
    growingMonths: [],
    growingSeasonRainMm: 0,
    heatShockMonths: 0,
    limitingFactor: 'No climate data',
    bands: null,
  };
}

/** Score one crop against climate.recent5Yr. */
export function scoreCrop(crop, climate) {
  const monthly = climate?.recent5Yr?.monthly;
  if (!monthly || monthly.length !== 12) return emptyScore(crop);

  const idx = getGrowingWindow(crop, monthly);
  const win = idx.map((i) => monthly[i]);

  const avgTempC = mean(win.map((m) => m.temp));
  const minTempC = mean(win.map((m) => m.minTemp));
  const maxTempC = mean(win.map((m) => m.maxTemp));
  const growingSeasonRainMm = sum(win.map((m) => m.rainMm));
  const avgGwetRoot = mean(win.map((m) => m.gwetRoot));
  const avgSolar = mean(win.map((m) => m.solar));

  const hardZero = minTempC < crop.lethalTemp[0] || maxTempC > crop.lethalTemp[1];
  const thermal = hardZero ? 0 : thermalFitForTemp(avgTempC, crop.optimalTemp, crop.lethalTemp);
  const rain = rainFitForMm(growingSeasonRainMm, crop.optimalRainMm, crop.minRainMm);
  const moisture = rootMoistureFit(avgGwetRoot, crop.optimalGwetRoot);
  const solar = solarFit(avgSolar, crop.optimalSolar);

  const envScore = Math.round(
    FIT_WEIGHTS.thermal * thermal +
      FIT_WEIGHTS.rain * rain +
      FIT_WEIGHTS.rootMoisture * moisture +
      FIT_WEIGHTS.solar * solar
  );
  const yieldMultiplier = thermal === 0 ? 0 : Math.max(0.2, envScore / 100);

  const components = [
    ['Temperature', thermal],
    ['Rainfall', rain],
    ['Root-zone moisture', moisture],
    ['Solar radiation', solar],
  ];
  const limitingFactor = components.reduce((a, b) => (b[1] < a[1] ? b : a))[0];

  return {
    cropId: crop.id,
    envScore,
    thermalFit: Math.round(thermal),
    rainFit: Math.round(rain),
    rootMoistureFit: Math.round(moisture),
    solarFit: Math.round(solar),
    yieldMultiplier: Math.round(yieldMultiplier * 100) / 100,
    growingMonths: idx.map((i) => monthly[i].month),
    growingSeasonRainMm: Math.round(growingSeasonRainMm),
    heatShockMonths: win.filter((m) => m.maxTemp > crop.heatShockThresholdC).length,
    limitingFactor,
    // Where the farm sits vs. each crop's band (for the range-bar visuals)
    bands: {
      temp: { value: Math.round(avgTempC * 10) / 10, optimal: crop.optimalTemp, lethal: crop.lethalTemp },
      rain: { value: Math.round(growingSeasonRainMm), optimal: crop.optimalRainMm, min: crop.minRainMm },
      gwet: { value: Math.round(avgGwetRoot * 100) / 100, optimal: crop.optimalGwetRoot },
    },
  };
}

/** Score every crop and return them ranked by envScore (desc). */
export function scoreAllCrops(crops, climate) {
  return crops
    .map((crop) => ({ crop, score: scoreCrop(crop, climate) }))
    .sort((a, b) => b.score.envScore - a.score.envScore || a.crop.name.localeCompare(b.crop.name));
}

// ---------- Economics helper (FAOSTAT baselines + farmer overrides) ----------

export const DISTANCE_OPTIONS = [
  { id: 'under20', label: '< 20 km' },
  { id: '20to100', label: '20–100 km' },
  { id: 'over100', label: '> 100 km' },
];

// Share of revenue lost to spoilage / transport by market distance.
const MARKET_HAIRCUT = {
  perishable: { under20: 0, '20to100': 0.08, over100: 0.25 },
  storable: { under20: 0, '20to100': 0, over100: 0.03 },
};

export function volatilityBadge(pct) {
  return pct <= 12 ? 'Low' : pct <= 18 ? 'Medium' : 'High';
}

/**
 * Per-hectare economics for one crop.
 * overrides: { priceMultiplierPct = 100, costMultiplierPct = 100, distanceToMarket = 'under20',
 *              inputDiscountPct = 0 }   (inputDiscountPct = rotation nitrogen credit)
 */
export function computeCropEconomics(crop, score, overrides = {}) {
  const {
    priceMultiplierPct = 100,
    costMultiplierPct = 100,
    distanceToMarket = 'under20',
    inputDiscountPct = 0,
  } = overrides;

  const haircut = MARKET_HAIRCUT[crop.perishability]?.[distanceToMarket] ?? 0;
  const yieldTha = crop.faostatYieldTha * (score?.yieldMultiplier ?? 0);
  const priceUsdT = crop.faostatPriceUsdT * (priceMultiplierPct / 100) * (1 - haircut);
  const baseCostHa = crop.benchmarkInputCostHa * (costMultiplierPct / 100);
  const inputCostHa = baseCostHa * (1 - inputDiscountPct / 100);
  const revenueHa = yieldTha * priceUsdT;
  const netMarginHa = revenueHa - inputCostHa;
  const waterMm = Math.max(1, Math.min(score?.growingSeasonRainMm ?? 0, crop.optimalRainMm));

  let perishabilityRisk = 'None';
  if (crop.perishability === 'perishable') {
    perishabilityRisk = distanceToMarket === 'over100' ? 'High' : distanceToMarket === '20to100' ? 'Moderate' : 'Low';
  }

  return {
    yieldTha: Math.round(yieldTha * 100) / 100,
    priceUsdT: Math.round(priceUsdT * 100) / 100,
    revenueHa: Math.round(revenueHa),
    inputCostHa: Math.round(inputCostHa),
    fertilizerSavedHa: Math.round(baseCostHa - inputCostHa),
    netMarginHa: Math.round(netMarginHa),
    waterReturnPerMm: Math.round((netMarginHa / waterMm) * 100) / 100,
    volatility: volatilityBadge(crop.priceVolatilityPct),
    perishabilityRisk,
  };
}
