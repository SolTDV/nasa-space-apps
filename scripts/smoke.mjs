import fs from 'node:fs';
import { parseNasaResponse, getFallbackClimate, fetchFarmClimate } from '../src/utils/nasaApi.js';
import { scoreAllCrops } from '../src/utils/cropScorer.js';
import { generateRotations } from '../src/utils/rotationEngine.js';
import { DEMO_PRESETS } from '../src/data/demoPresets.js';

const crops = JSON.parse(fs.readFileSync('src/data/crops.json', 'utf8'));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

// --- schema check
const keys = ['id','name','botanicalFamily','nitrogenRole','rootDepth','residueLevel','seasonType','waterUse','optimalTemp','lethalTemp','heatShockThresholdC','optimalRainMm','minRainMm','optimalGwetRoot','optimalSolar','soilPreference','faostatYieldTha','faostatPriceUsdT','priceVolatilityPct','benchmarkInputCostHa','perishability'];
assert(crops.length === 12 && crops.every(c => keys.every(k => k in c)), '12 crops follow schema');

// --- synthetic NASA response (with -999 and YYYY13)
function fake({ water = false } = {}) {
  const p = Object.fromEntries(['T2M','T2M_MAX','T2M_MIN','PRECTOTCORR','GWETROOT','ALLSKY_SFC_SW_DWN'].map(k => [k, {}]));
  for (let y = 2006; y <= 2025; y++) {
    for (let m = 1; m <= 13; m++) {
      const k = `${y}${String(m).padStart(2,'0')}`;
      const t = 10 + 12 * Math.sin(((m - 4) / 12) * 2 * Math.PI) + (y >= 2021 ? 0.8 : 0);
      p.T2M[k] = t; p.T2M_MAX[k] = t + 6; p.T2M_MIN[k] = t - 6;
      p.PRECTOTCORR[k] = 2.5; p.GWETROOT[k] = water ? -999 : 0.55; p.ALLSKY_SFC_SW_DWN[k] = 15;
    }
  }
  p.T2M['202301'] = -999; p.T2M_MAX['202301'] = -999;   // single missing month
  p.T2M['200613'] = 999;                                // annual key must be ignored
  return { properties: { parameter: p } };
}
const live = parseNasaResponse(fake(), 40, -90);
assert(!live.isWaterBody && !live.isFallback && live.baseline20Yr.monthly.length === 12, 'live parse -> 12 monthly rows');
assert(Math.abs(live.baseline20Yr.annualRainMm - 2.5 * 30.4 * 12) < 1, 'PRECTOTCORR x30.4 summed = ' + live.baseline20Yr.annualRainMm);
assert(live.deltas.tempDeltaC > 0.5 && live.deltas.tempDeltaC < 1.1, 'temp delta ' + live.deltas.tempDeltaC);
assert(parseNasaResponse(fake({ water: true }), 0, 0).isWaterBody === true, 'all -999 -> isWaterBody');

// --- fallback via real fetch (sandbox has no NASA access -> must fall back, never throw)
const t0 = Date.now();
const f = await fetchFarmClimate(42.03, -93.631);
console.log(`fetchFarmClimate -> isFallback=${f.isFallback} (${Date.now()-t0}ms) ${f.fallbackReason ?? ''}`);
assert(f.isWaterBody === false && f.baseline20Yr.monthly.length === 12, 'fetch returns usable climate');

// --- per preset
for (const p of DEMO_PRESETS) {
  const c = getFallbackClimate(p.lat, p.lon);
  console.log(`\n=== ${p.label} [${c.fallbackRegion}] T=${c.recent5Yr.avgTempC}C rain=${c.recent5Yr.annualRainMm}mm dT=${c.deltas.tempDeltaC} dRain=${c.deltas.rainDeltaPct}% heatMonths=${c.deltas.heatStressMonths}`);
  const ranked = scoreAllCrops(crops, c);
  console.log(ranked.map(r => `${r.crop.id}:${r.score.envScore}`).join('  '));
  const out = generateRotations(crops, c, { currentCropId: p.currentCrop });
  const b = out.baseline;
  console.log(`BASELINE ${b.label} res=${b.resilienceScore} water=${b.waterRisk} profit=$${b.netProfit3Yr}`);
  for (const r of out.adapted) {
    const d = r.vsBaseline;
    console.log(`${r.strategy.id.padEnd(10)} ${r.label}  res=${r.resilienceScore}(${d.resilienceDeltaPts>=0?'+':''}${d.resilienceDeltaPts}) water=${r.waterRisk}(${d.waterRiskDeltaPts}) profit=$${r.netProfit3Yr} fert=$${r.fertilizerSaved}  [${r.badges.map(x=>x.label).join('; ')}]`);
  }
  assert(out.adapted.length === 3 && new Set(out.adapted.map(r => r.id)).size === 3, 'three distinct adapted rotations');
  assert(out.adapted.every(r => r.sequence[0] !== r.sequence[1] && r.sequence[1] !== r.sequence[2]), 'no consecutive monoculture');
}
const iowa = generateRotations(crops, getFallbackClimate(42.03,-93.631), { currentCropId:'maize' });
console.log('\nChecklist sample:', iowa.adapted[0].checklist);
