import fs from 'node:fs';
import { parseNasaResponse, getFallbackClimate, fetchFarmClimate } from '../src/utils/nasaApi.js';
import { scoreAllCrops } from '../src/utils/cropScorer.js';
import { generateRotations, pickForGoal, GOAL_IDS } from '../src/utils/rotationEngine.js';
import { DEMO_PRESETS } from '../src/data/demoPresets.js';

const crops = JSON.parse(fs.readFileSync('src/data/crops.json', 'utf8'));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

// --- schema check
const keys = ['id','name','botanicalFamily','nitrogenRole','rootDepth','residueLevel','seasonType','waterUse','optimalTemp','lethalTemp','heatShockThresholdC','optimalRainMm','minRainMm','optimalGwetRoot','optimalSolar','soilPreference','faostatYieldTha','faostatPriceUsdT','priceVolatilityPct','benchmarkInputCostHa','perishability'];
const missing = crops.flatMap(c => keys.filter(k => !(k in c)).map(k => `${c.id}.${k}`));
assert(crops.length >= 30 && missing.length === 0, `${crops.length} crops follow schema${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
assert(new Set(crops.map(c => c.id)).size === crops.length, 'crop ids are unique');
{ const { shortCropName } = await import('../src/utils/cropNames.js');
  const names = crops.map(shortCropName);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert(dup.length === 0, `short display names are unique${dup.length ? ' (duplicates: ' + dup.join(', ') + ')' : ''} (rice: ${shortCropName(crops.find(c => c.id === 'rice_paddy'))} / ${shortCropName(crops.find(c => c.id === 'rice_upland'))})`); }

// --- solar radiation: NASA POWER monthly (community=ag) returns ALLSKY_SFC_SW_DWN in MJ/m^2/day
{ const src = ['src/components/ClimateShiftTab.jsx', 'src/components/CropFitTab.jsx', 'src/components/FutureSimulatorTab.jsx'].map(f => fs.readFileSync(f, 'utf8')).join('');
  assert(src.includes('Solar Radiation (MJ/m²/day)') && !/kWh/i.test(src), 'solar radiation labelled MJ/m²/day, never kWh'); }
// --- synthetic NASA response (with -999 and YYYY13)
function fake({ water = false } = {}) {
  const p = Object.fromEntries(['T2M','T2M_RANGE','PRECTOTCORR','GWETROOT','ALLSKY_SFC_SW_DWN'].map(k => [k, {}]));
  for (let y = 2006; y <= 2025; y++) {
    for (let m = 1; m <= 13; m++) {
      const k = `${y}${String(m).padStart(2,'0')}`;
      const t = 10 + 12 * Math.sin(((m - 4) / 12) * 2 * Math.PI) + (y >= 2021 ? 0.8 : 0);
      p.T2M[k] = t; p.T2M_RANGE[k] = 12;
      p.PRECTOTCORR[k] = 2.5; p.GWETROOT[k] = water ? -999 : 0.55; p.ALLSKY_SFC_SW_DWN[k] = 15;
    }
  }
  p.T2M['202301'] = -999; p.T2M_RANGE['202301'] = -999;   // single missing month
  p.T2M['200613'] = 999;                                // annual key must be ignored
  return { properties: { parameter: p } };
}
// --- page title / description match the app name
const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('<title>FieldShift — Crop Rotation &amp; Weather Advisor</title>') && /<meta\s+name="description"\s+content="FieldShift/.test(html), 'index.html title + meta description say FieldShift');
const live = parseNasaResponse(fake(), 40, -90);
assert(!live.isWaterBody && !live.isFallback && live.baseline20Yr.monthly.length === 12, 'live parse -> 12 monthly rows');
assert(Math.abs(live.baseline20Yr.annualRainMm - 2.5 * 30.4 * 12) < 1, 'PRECTOTCORR x30.4 summed = ' + live.baseline20Yr.annualRainMm);
assert(live.deltas.tempDeltaC > 0.5 && live.deltas.tempDeltaC < 1.1, 'temp delta ' + live.deltas.tempDeltaC);
assert(parseNasaResponse(fake({ water: true }), 0, 0).isWaterBody === true, 'all -999 -> isWaterBody');
const jul = live.baseline20Yr.monthly[6];
assert(Math.abs(jul.maxTemp - (jul.temp + 6)) < 0.01 && Math.abs(jul.minTemp - (jul.temp - 6)) < 0.01, 'maxTemp/minTemp = T2M +/- T2M_RANGE/2 (typical day, not monthly extreme)');

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
  const goals = GOAL_IDS.map(g => pickForGoal(out, g));
  console.log('goals: ' + GOAL_IDS.map((g, i) => `${g}=${goals[i].label}${goals[i].alsoBestFor.length ? ' (also ' + goals[i].alsoBestFor.join('+') + ')' : ''}`).join(' | '));
  assert(new Set(goals.map(r => r.id)).size >= 2, 'the 4 goals give at least 2 different suggestions');
  assert(goals.every((r, i) => r.alsoBestFor.every(g => pickForGoal(out, g).id === r.id) &&
    GOAL_IDS.filter((g, j) => j !== i && goals[j].id === r.id).length === r.alsoBestFor.length), 'goals sharing a rotation are reported as such');
}
// --- a crop that cannot grow (thermal fit 0) must not show a decent weather-fit score
const scorching = getFallbackClimate(10.05, 105.75);
scorching.recent5Yr.monthly = scorching.recent5Yr.monthly.map(m => ({ ...m, temp: m.temp + 14, maxTemp: m.maxTemp + 14, minTemp: m.minTemp + 14 }));
const dead = scoreAllCrops(crops, scorching).filter(r => r.score.thermalFit === 0);
assert(dead.length > 0 && dead.every(r => r.score.envScore <= 15 && r.score.yieldMultiplier === 0), `thermal fit 0 -> score <= 15 and 0 t/ha (${dead.length} crops)`);
// --- irrigated mode must reach the rotation engine (same fit as the Crop Suitability tab)
const ks = getFallbackClimate(38.48, -100.9);
const fitIrr = scoreAllCrops(crops, ks, { waterSupply: 'irrigated' }).find(r => r.crop.id === 'maize').score.envScore;
const rotIrr = generateRotations(crops, ks, { currentCropId: 'maize', waterSupply: 'irrigated' }).baseline.perSeason[0].envScore;
assert(fitIrr === rotIrr, `irrigated maize fit: Crop tab ${fitIrr}% = Rotation tab ${rotIrr}%`);
// --- irrigation is not free
{ const { computeCropEconomics, scoreCrop } = await import('../src/utils/cropScorer.js');
  const maize = crops.find(c => c.id === 'maize');
  const irr = computeCropEconomics(maize, scoreCrop(maize, ks, { waterSupply: 'irrigated' }), { waterSupply: 'irrigated' });
  const dry = computeCropEconomics(maize, scoreCrop(maize, ks, { waterSupply: 'irrigated' }), {});
  assert(irr.irrigationCostHa > 0 && irr.inputCostHa === dry.inputCostHa + irr.irrigationCostHa, `irrigated maize pays $${irr.irrigationCostHa}/ha irrigation`);
  const own = computeCropEconomics(maize, scoreCrop(maize, ks, { waterSupply: 'irrigated' }), { waterSupply: 'irrigated', irrigationCostPct: 50 });
  assert(own.irrigationCostHa === Math.round(irr.irrigationCostHa / 2), `farmer can set own irrigation cost (50% -> $${own.irrigationCostHa}/ha)`); }
const iowa = generateRotations(crops, getFallbackClimate(42.03,-93.631), { currentCropId:'maize' });
console.log('\nChecklist sample:', iowa.adapted[0].checklist);
