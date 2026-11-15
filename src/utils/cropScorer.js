// Pure NASA POWER + FAO GAEZ management-aware crop environmental fit,
// plus economics helper shared by EconomicsTab and rotationEngine.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

export const GROWING_SEASON_MONTHS = { warm: 6, cool: 7 };

export const FIT_WEIGHTS = { thermal: 0.35, rain: 0.3, rootMoisture: 0.2, solar: 0.15 };

// Highest weather-fit score shown for a crop whose temperature fit is zero (cannot grow here).
export const NOT_VIABLE_MAX_SCORE = 15;

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
  return 30 * Math.pow(Math.max(rainMm, 0) / minMm, 2);
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

/**
 * Score one crop against climate.recent5Yr.
 * options: { waterSupply: 'rainfed' | 'irrigated' }
 */
export function scoreCrop(crop, climate, options = {}) {
  const monthly = climate?.recent5Yr?.monthly;
  if (!monthly || monthly.length !== 12) return emptyScore(crop);

  const isIrrigated = options.waterSupply === 'irrigated';
  const idx = getGrowingWindow(crop, monthly);
  const win = idx.map((i) => monthly[i]);

  const avgTempC = mean(win.map((m) => m.temp));
  const minTempC = mean(win.map((m) => m.minTemp));
  const maxTempC = mean(win.map((m) => m.maxTemp));
  const growingSeasonRainMm = sum(win.map((m) => m.rainMm));
  const avgGwetRoot = mean(win.map((m) => m.gwetRoot));
  const avgSolar = mean(win.map((m) => m.solar));

  // Check mean growing-season temperature against lethal bounds (with a 3°C buffer for afternoon highs)
  const hardZero = avgTempC < crop.lethalTemp[0] || avgTempC > crop.lethalTemp[1] || maxTempC > crop.lethalTemp[1] + 4;
  const thermal = hardZero ? 0 : thermalFitForTemp(avgTempC, crop.optimalTemp, crop.lethalTemp);

  const rawRain = rainFitForMm(growingSeasonRainMm, crop.optimalRainMm, crop.minRainMm);
  const rawMoisture = rootMoistureFit(avgGwetRoot, crop.optimalGwetRoot);

  // Under irrigated management, supplemental water buffers seasonal rainfall deficits
  const rain = isIrrigated ? Math.max(rawRain, 92) : rawRain;
  const moisture = isIrrigated ? Math.max(rawMoisture, 90) : rawMoisture;
  const solar = solarFit(avgSolar, crop.optimalSolar);

  const weightedScore = Math.round(
    FIT_WEIGHTS.thermal * thermal +
      FIT_WEIGHTS.rain * rain +
      FIT_WEIGHTS.rootMoisture * moisture +
      FIT_WEIGHTS.solar * solar
  );
  // Too hot or too cold to grow at all: good rain and sun must not make it look like a decent fit.
  const envScore = thermal === 0 ? Math.min(weightedScore, NOT_VIABLE_MAX_SCORE) : weightedScore;

  // Map 85%+ environmental suitability to ~100% attainable FAOSTAT regional yield
  const irrigationYieldBoost = isIrrigated ? 1.12 : 1.0;
  const attainableFraction = Math.min(1.08, (envScore / 85) * irrigationYieldBoost);
  const yieldMultiplier = thermal === 0 ? 0 : Math.max(0.25, attainableFraction);

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
    bands: {
      temp: { value: Math.round(avgTempC * 10) / 10, optimal: crop.optimalTemp, lethal: crop.lethalTemp },
      rain: { value: Math.round(growingSeasonRainMm), optimal: crop.optimalRainMm, min: crop.minRainMm },
      gwet: { value: Math.round(avgGwetRoot * 100) / 100, optimal: crop.optimalGwetRoot },
    },
  };
}

/** Score every crop and return them ranked by envScore (desc). */
export function scoreAllCrops(crops, climate, options = {}) {
  return crops
    .map((crop) => ({ crop, score: scoreCrop(crop, climate, options) }))
    .sort((a, b) => b.score.envScore - a.score.envScore || a.crop.name.localeCompare(b.crop.name));
}

// ---------- Economics helper (FAOSTAT baselines + farmer overrides) ----------

export const DISTANCE_OPTIONS = [
  { id: 'under20', label: '< 20 km' },
  { id: '20to100', label: '20–100 km' },
  { id: 'over100', label: '> 100 km' },
];

const MARKET_HAIRCUT = {
  perishable: { under20: 0, '20to100': 0.08, over100: 0.25 },
  storable: { under20: 0, '20to100': 0, over100: 0.03 },
};

// Estimated irrigation cost per hectare per season (pumping energy, fuel, water/canal fees), by the crop's water need.
// ASSUMPTION: these 45 / 95 / 160 $/ha values are rough placeholders chosen for the demo, not taken from a
// published dataset. Farmers can scale them to their own cost with the "Estimated irrigation cost" slider
// (irrigationCostPct) on the Profit & Costs tab.
export const IRRIGATION_COST_HA = { low: 45, medium: 95, high: 160 };
export const IRRIGATION_COST_NOTE =
  "Rough pumping and water cost based on the crop's water need. Change it to your own cost.";

export function volatilityBadge(pct) {
  return pct <= 12 ? 'Low' : pct <= 18 ? 'Medium' : 'High';
}

export function computeCropEconomics(crop, score, overrides = {}) {
  const {
    priceMultiplierPct = 100,
    costMultiplierPct = 100,
    distanceToMarket = 'under20',
    inputDiscountPct = 0,
    waterSupply = 'rainfed',
    irrigationCostPct = 100,
  } = overrides;

  const haircut = MARKET_HAIRCUT[crop.perishability]?.[distanceToMarket] ?? 0;
  const rawMult = score?.yieldMultiplier ?? 0;
  const yieldTha = crop.faostatYieldTha * rawMult;
  const priceUsdT = crop.faostatPriceUsdT * (priceMultiplierPct / 100) * (1 - haircut);

  // Split input costs into 55% upfront (seed/prep) + 45% yield-dependent (fertilizer top-up/harvest/packing)
  const costScale = 0.55 + 0.45 * Math.min(1, rawMult);
  const baseCostHa = crop.benchmarkInputCostHa * costScale * (costMultiplierPct / 100);
  // Estimated irrigation cost scales with the crop's water need and the farmer's own irrigation-cost setting;
  // the legume credit does not cut it
  const irrigationCostHa =
    waterSupply === 'irrigated' ? (IRRIGATION_COST_HA[crop.waterUse] ?? IRRIGATION_COST_HA.medium) * (irrigationCostPct / 100) : 0;
  const inputCostHa = baseCostHa * (1 - inputDiscountPct / 100) + irrigationCostHa;

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
    irrigationCostHa: Math.round(irrigationCostHa),
    fertilizerSavedHa: Math.round(baseCostHa * (inputDiscountPct / 100)),
    netMarginHa: Math.round(netMarginHa),
    waterReturnPerMm: Math.round((netMarginHa / waterMm) * 100) / 100,
    volatility: volatilityBadge(crop.priceVolatilityPct),
    perishabilityRisk,
  };
}