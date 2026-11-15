// Checks for the hidden soil-moisture model: node scripts/soil.mjs
import { trainSoilModel, simulateSoil, assessWaterRisk, isUsable, formatMonths } from '../src/utils/soilMoistureModel.js';

const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

// Synthetic Mekong-like history where soil moisture really does follow rain and temperature
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const rain = [7, 4, 15, 65, 180, 210, 215, 225, 270, 260, 120, 35];
const temp = [25.5, 26.2, 27.3, 28.3, 28.2, 27.6, 27.3, 27.3, 27.3, 27.2, 26.8, 25.8];
const gwet = [0.62, 0.55, 0.5, 0.5, 0.6, 0.72, 0.78, 0.8, 0.85, 0.85, 0.78, 0.7];
const series = [];
let d1 = 0, d2 = 0, tA = 0;
for (let y = 2006; y <= 2025; y++) for (let m = 1; m <= 12; m++) {
  const i = m - 1;
  const r = Math.max(0, rain[i] * (1 + 0.35 * gauss()));
  tA = 0.6 * tA + 0.4 * gauss() * 0.7;
  const dr = r - rain[i];
  const g = gwet[i] + 2.4e-4 * dr + 3.2e-4 * d1 + 2e-4 * d2 - 0.032 * tA + 0.03 * gauss();
  d2 = d1; d1 = dr;
  series.push({ year: y, month: m, rainMm: r, temp: temp[i] + tA, gwetRoot: Math.min(1, Math.max(0.05, g)) });
}
const base = rain.map((r, i) => ({ rainMm: r, gwetRoot: gwet[i] }));

const model = trainSoilModel(series);
check(isUsable(model), `model trains on 20 years (skill ${model?.skill.toFixed(2)}, ${model?.reliability})`);
check(model.coef.rain > 0 && model.coef.temp <= 0, 'more rain -> wetter soil, warmer -> drier soil');

const risk = (t, r, plan = []) =>
  assessWaterRisk({ model, baseMonthly: base, simGwet: simulateSoil(model, base, t, r), tempDeltaC: t, rainDeltaPct: r, plan, lowWaterAlternatives: ['Mung Bean'] });
const newDry = (x) => x.monthFlags.filter((f) => f === 'new').length;
check(risk(0, 0).level === 'low', 'no change -> no extra risk');
check(risk(0, 20).level === 'low', 'wetter scenario -> no extra risk');
check(newDry(risk(3.2, -15)) >= newDry(risk(1.5, -3)), 'hotter and drier -> at least as many dry months');
const hot = risk(3.2, -15, [{ name: 'Maize', months: [0, 1, 2, 3] }]);
check(hot.level !== 'low' && hot.advice.length > 0, `hot & dry gives advice: "${hot.advice[0]}"`);
check(!JSON.stringify(hot).match(/R2|r_squared|skill|coef/i), 'verdict text has no technical terms');
check(trainSoilModel([]) === null && trainSoilModel(series.slice(0, 60)) === null, 'too little data -> no model (card hidden)');
const flat = series.map((r) => ({ ...r, rainMm: 100, temp: 27, gwetRoot: 0.6 }));
check(!isUsable(trainSoilModel(flat)), 'flat data -> not usable');
check(formatMonths([0, 1, 11]) === 'Dec–Feb' && formatMonths([3]) === 'Apr', 'month ranges wrap Dec->Jan');
