// 2-to-4 season rotation engine: scores [Crop1, ... CropN] with deterministic agronomic
// rules, penalizes stacked perishable market risk, and ensures recommendations improve on baseline.

import { scoreCrop, computeCropEconomics } from './cropScorer.js';

export const DRYLAND_RAIN_MM = 550;
export const WATERLOGGING_RAIN_MM = 1100;
export const NITROGEN_CREDIT_PCT = 15;
export const MIN_VIABLE_ENV_SCORE = 35;

const WATERLOGGING_SENSITIVE = ['alfalfa', 'chickpea', 'potato'];
const SLOPE_COVER_CROPS = ['alfalfa', 'red_clover', 'sorghum'];
const WATER_USE_INDEX = { low: 20, medium: 50, high: 85 };

const RAW_SPAN = 180;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
const shortName = (crop) => crop.name.split(' (')[0];
const badge = (id, label, tone) => ({ id, label, tone });

export const STRATEGIES = [
  {
    id: 'resilience',
    title: 'Climate & Pest Resilience Focus',
    description: 'Maximises agronomic rule score plus NASA POWER environmental fit.',
  },
  {
    id: 'water',
    title: 'Water-Smart Conservation Focus',
    description: 'Minimises water demand and protects soil-moisture carryover.',
  },
  {
    id: 'profit',
    title: 'Profit & Nitrogen-Balanced Focus',
    description: 'Maximises risk-adjusted margin, including legume nitrogen savings.',
  },
];

// ---------- Context ----------

export function buildContext(crops, climate, options = {}) {
  return {
    crops,
    cropMap: Object.fromEntries(crops.map((c) => [c.id, c])),
    scores: Object.fromEntries(crops.map((c) => [c.id, scoreCrop(c, climate)])),
    annualRainMm: climate?.recent5Yr?.annualRainMm ?? 0,
    soilTexture: options.soilTexture ?? 'Unknown',
    soilPh: options.soilPh ?? 'Unknown',
    slopingLand: Boolean(options.slopingLand),
    overrides: options.overrides ?? {},
  };
}

// ---------- The rules + optional farmer modifiers ----------

function applyRules(seq, ctx) {
  const L = seq.length;
  const rules = [];
  const badges = [];
  const discounts = Array(L).fill(0);

  // Rule 1 - Nitrogen synergy
  let p1 = 0;
  for (let i = 0; i < L - 1; i++) {
    if (seq[i].nitrogenRole === 'fixer' && seq[i + 1].nitrogenRole === 'heavy_feeder') {
      p1 += 25;
      discounts[i + 1] = NITROGEN_CREDIT_PCT;
      badges.push(badge('n_fixer_heavy', `Y${i + 1} Fixer → Y${i + 2} Heavy Feeder`, 'positive'));
    }
  }
  if (L >= 3 && seq[0].nitrogenRole === 'fixer' && seq[L - 1].nitrogenRole === 'light_feeder') {
    p1 += 10;
    badges.push(badge('n_fixer_light', 'Fixer Carryover → Final Light Feeder', 'positive'));
  }
  rules.push({ id: 'nitrogen', label: 'Nitrogen Synergy', points: p1 });

  // Rule 2 - Pest, disease & botanical family break
  let clash = false;
  for (let i = 0; i < L - 1; i++) {
    if (seq[i].id === seq[i + 1].id || seq[i].botanicalFamily === seq[i + 1].botanicalFamily) {
      clash = true;
      break;
    }
  }
  if (!clash && L >= 3 && (seq[L - 1].id === seq[0].id || seq[L - 1].botanicalFamily === seq[0].botanicalFamily)) {
    clash = true;
  }

  const uniqueFamilies = new Set(seq.map((c) => c.botanicalFamily)).size;
  const diverseFamilies = uniqueFamilies === L;
  const p2 = clash ? -40 : diverseFamilies ? 20 : 0;
  if (clash) badges.push(badge('family_clash', 'Same-Family Back-to-Back/Loop', 'negative'));
  else if (diverseFamilies) badges.push(badge('three_family', `${L}-Family Pest Break`, 'positive'));
  rules.push({ id: 'pest', label: 'Pest & Disease Break', points: p2 });

  // Rule 3 - Soil structure & organic matter
  let p3 = 0;
  if (seq.some((c) => c.rootDepth === 'deep')) {
    p3 += 15;
    badges.push(badge('deep_root', 'Deep-Root Subsoil Scavenger', 'positive'));
  }
  if (seq.some((c) => c.residueLevel === 'high')) {
    p3 += 15;
    badges.push(badge('residue', 'High-Residue Organic Matter', 'positive'));
  }
  rules.push({ id: 'soil', label: 'Soil Structure & Organic Matter', points: p3 });

  // Rule 4 - Cool/warm season alternation
  const seasons = new Set(seq.map((c) => c.seasonType));
  const p4 = seasons.has('cool') && seasons.has('warm') ? 15 : 0;
  if (p4) badges.push(badge('season_mix', 'Cool/Warm Season Alternation', 'positive'));
  rules.push({ id: 'weed', label: 'Weed Suppression', points: p4 });

  // Rule 5 - Soil moisture carryover (dryland regime only)
  let p5 = 0;
  let moistureDepletion = false;
  if (ctx.annualRainMm < DRYLAND_RAIN_MM) {
    for (let i = 0; i < L - 1; i++) {
      if (seq[i].waterUse === 'high' && seq[i + 1].waterUse !== 'low') {
        moistureDepletion = true;
      }
    }
    if (moistureDepletion) {
      p5 = -30;
      badges.push(badge('moisture_depletion', 'Moisture Depletion Risk', 'negative'));
    } else if (seq.every((c) => c.waterUse !== 'high') && seq.some((c) => c.waterUse === 'low')) {
      p5 = 10;
      badges.push(badge('dryland_saver', 'Dryland Moisture Saver', 'positive'));
    }
  }
  rules.push({ id: 'moisture', label: 'Soil Moisture Carryover', points: p5 });

  // Optional farmer modifiers
  let pMod = 0;
  const ids = new Set(seq.map((c) => c.id));
  if (ctx.soilTexture === 'Clay' && ctx.annualRainMm > WATERLOGGING_RAIN_MM) {
    const hits = WATERLOGGING_SENSITIVE.filter((id) => ids.has(id));
    if (hits.length) {
      pMod -= 15 * hits.length;
      badges.push(badge('waterlogging', 'Waterlogging Risk on Clay', 'negative'));
    }
  }
  if (ctx.slopingLand && SLOPE_COVER_CROPS.some((id) => ids.has(id))) {
    pMod += 15;
    badges.push(badge('slope_cover', 'Erosion-Control Cover', 'positive'));
  }
  if (pMod !== 0) rules.push({ id: 'modifiers', label: 'Farmer Soil & Terrain Modifiers', points: pMod });

  const raw = rules.reduce((s, r) => s + r.points, 0);
  return { raw, rules, badges, discounts, moistureDepletion };
}

// ---------- Evaluate one rotation ----------

export function evaluateRotation(cropIds, ctx) {
  const seq = cropIds.map((id) => {
    const crop = ctx.cropMap[id];
    if (!crop) throw new Error(`Unknown crop id: ${id}`);
    return crop;
  });

  const { raw, rules, badges, discounts, moistureDepletion } = applyRules(seq, ctx);
  const scores = seq.map((c) => ctx.scores[c.id]);

  const perSeason = seq.map((crop, i) => ({
    season: i + 1,
    cropId: crop.id,
    cropName: crop.name,
    envScore: scores[i].envScore,
    ...computeCropEconomics(crop, scores[i], { ...ctx.overrides, inputDiscountPct: discounts[i] }),
  }));

  const ruleScore = clamp(Math.round(((raw + 70) / RAW_SPAN) * 100), 0, 100);
  const avgEnvFit = Math.round(mean(scores.map((s) => s.envScore)));
  const resilienceScore = Math.round(0.6 * ruleScore + 0.4 * avgEnvFit);

  const avgWaterUse = mean(seq.map((c) => WATER_USE_INDEX[c.waterUse] ?? 50));
  const avgRainShortfall = mean(scores.map((s) => 100 - s.rainFit));
  const waterRisk = Math.round(
    clamp(0.5 * avgWaterUse + 0.35 * avgRainShortfall + 0.15 * (moistureDepletion ? 100 : 0), 0, 100)
  );

  const netProfitTotal = perSeason.reduce((s, p) => s + p.netMarginHa, 0);
  const fertilizerSaved = perSeason.reduce((s, p) => s + p.fertilizerSavedHa, 0);

  // Risk-adjusted profit accounts for price volatility and stacked perishable crops
  const perishableCount = seq.filter((c) => c.perishability === 'perishable').length;
  const hasLegume = seq.some((c) => c.nitrogenRole === 'fixer');
  const avgVolatility = mean(seq.map((c) => c.priceVolatilityPct ?? 15));
  const perishablePenalty = perishableCount > 1 ? 0.65 ** (perishableCount - 1) : 1;
  const riskAdjustedProfit =
    netProfitTotal * (1 - avgVolatility / 100) * perishablePenalty * (hasLegume ? 1.15 : 0.9);

  return {
    id: cropIds.join('>'),
    sequence: [...cropIds],
    cropNames: seq.map(shortName),
    label: seq.map(shortName).join(' → '),
    rawRuleScore: raw,
    ruleScore,
    avgEnvFit,
    resilienceScore,
    waterRisk,
    waterScore: 100 - waterRisk,
    netProfit3Yr: netProfitTotal, // kept property name for compatibility with dependent components
    riskAdjustedProfit,
    fertilizerSaved,
    perishableCount,
    hasLegume,
    perSeason,
    rules,
    badges,
    checklist: [],
  };
}

// ---------- "Verify on Your Field" checklist ----------

const PH_RANGES = { Acidic: [4.5, 6.0], Neutral: [6.0, 7.4], Alkaline: [7.4, 8.5] };

export function buildFieldChecklist(rotation, ctx) {
  const items = [];
  const crops = [...new Set(rotation.sequence)].map((id) => ctx.cropMap[id]);

  const phRange = PH_RANGES[ctx.soilPh];
  if (phRange) {
    const off = crops.filter((c) => c.soilPreference.idealPh[1] < phRange[0] || c.soilPreference.idealPh[0] > phRange[1]);
    if (off.length) items.push(`Your reported ${ctx.soilPh.toLowerCase()} soil sits outside the ideal pH of ${off.map(shortName).join(', ')} — test and consider liming or a different crop.`);
  } else {
    const c = crops[0];
    items.push(`Soil-test pH: NASA POWER can't see it (e.g. ${shortName(c)} prefers ${c.soilPreference.idealPh[0]}–${c.soilPreference.idealPh[1]}).`);
  }

  if (ctx.soilTexture !== 'Unknown') {
    const off = crops.filter((c) => !c.soilPreference.idealTexture.includes(ctx.soilTexture));
    if (off.length) items.push(`${ctx.soilTexture} soil is not the usual texture for ${off.map(shortName).join(', ')} — check drainage and water-holding on your field.`);
  } else {
    items.push('Confirm soil texture and drainage on your field; the model does not assume any.');
  }

  if (rotation.badges.some((b) => b.id === 'n_fixer_heavy')) {
    items.push(`Soil-test nitrogen before cutting fertiliser; the ${NITROGEN_CREDIT_PCT}% input saving is a modelled estimate. Confirm the right rhizobia inoculant for the legume.`);
  } else if (crops.some((c) => c.nitrogenRole === 'fixer')) {
    items.push('Confirm the right rhizobia inoculant and seed source for the legume.');
  }

  if (rotation.badges.some((b) => b.id === 'moisture_depletion')) {
    items.push('Measure stored soil moisture before planting the follow-on crop (dryland carryover risk).');
  }
  if (rotation.badges.some((b) => b.id === 'waterlogging')) {
    items.push('Check tile/surface drainage: waterlogging-sensitive crops are in this sequence on heavy clay.');
  }
  if (rotation.badges.some((b) => b.id === 'family_clash')) {
    items.push('Review your field pest and disease history; back-to-back crops of one family raise pressure.');
  }

  const perishable = crops.filter((c) => c.perishability === 'perishable');
  if (perishable.length) items.push(`Confirm buyer, storage and transport for ${perishable.map(shortName).join(', ')} (perishable).`);

  const heat = rotation.sequence.map((id) => ({ id, m: ctx.scores[id].heatShockMonths })).filter((x) => x.m > 0);
  if (heat.length) items.push(`Heat-shock months overlap the season for ${[...new Set(heat.map((h) => shortName(ctx.cropMap[h.id])))].join(', ')} — check heat-tolerant varieties and planting dates.`);

  items.push('Check local seed availability, machinery, labour and contracted prices for each crop.');
  return items.slice(0, 8);
}

// ---------- Baseline comparison & priority ranking ----------

function pctDelta(value, base) {
  return Math.abs(base) < 1e-9 ? null : Math.round(((value - base) / Math.abs(base)) * 1000) / 10;
}

export function compareToBaseline(rotation, baseline) {
  return {
    resilienceDeltaPts: rotation.resilienceScore - baseline.resilienceScore,
    resilienceDeltaPct: pctDelta(rotation.resilienceScore, baseline.resilienceScore),
    waterRiskDeltaPts: rotation.waterRisk - baseline.waterRisk,
    waterRiskDeltaPct: pctDelta(rotation.waterRisk, baseline.waterRisk),
    profitDelta: rotation.netProfit3Yr - baseline.netProfit3Yr,
    profitDeltaPct: pctDelta(rotation.netProfit3Yr, baseline.netProfit3Yr),
    fertilizerSaved: rotation.fertilizerSaved - baseline.fertilizerSaved,
  };
}

export function rankByPriorities(rotations, weights = {}) {
  const w = { resilience: 1, water: 1, profit: 1, ...weights };
  const total = w.resilience + w.water + w.profit || 1;
  const profits = rotations.map((r) => r.riskAdjustedProfit ?? r.netProfit3Yr);
  const lo = Math.min(...profits);
  const span = Math.max(...profits) - lo || 1;

  return rotations
    .map((r) => {
      const pVal = r.riskAdjustedProfit ?? r.netProfit3Yr;
      const profitScore = ((pVal - lo) / span) * 100;
      const compositeScore =
        (w.resilience * r.resilienceScore + w.water * r.waterScore + w.profit * profitScore) / total;
      return { ...r, compositeScore: Math.round(compositeScore * 10) / 10 };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore || a.id.localeCompare(b.id));
}

// ---------- Generate baseline + adapted strategies ----------

const SORTERS = {
  resilience: (a, b) =>
    b.resilienceScore - a.resilienceScore || b.riskAdjustedProfit - a.riskAdjustedProfit || a.id.localeCompare(b.id),
  water: (a, b) =>
    a.waterRisk - b.waterRisk || b.resilienceScore - a.resilienceScore || a.id.localeCompare(b.id),
  profit: (a, b) =>
    b.riskAdjustedProfit - a.riskAdjustedProfit || b.resilienceScore - a.resilienceScore || a.id.localeCompare(b.id),
};

export function generateRotations(crops, climate, options = {}) {
  const ctx = buildContext(crops, climate, options);
  const normalizeId = (id) => (id === 'rice' ? 'rice_paddy' : id);
  const rotationLength = clamp(Number(options.rotationLength ?? 3), 2, 4);

  const current = normalizeId(options.currentCropId) || crops[0]?.id;
  let rawSeq = Array.isArray(options.baselineSequence) ? options.baselineSequence : [current];
  rawSeq = rawSeq.map(normalizeId);

  while (rawSeq.length < rotationLength) {
    rawSeq.push(rawSeq[rawSeq.length - 1] || current);
  }
  rawSeq = rawSeq.slice(0, rotationLength);

  const baseSeq = rawSeq.map((rawId) => (ctx.cropMap[rawId] ? rawId : crops[0].id));

  const isMonoculture = baseSeq.every((id) => id === baseSeq[0]);
  const baseline = evaluateRotation(baseSeq, ctx);
  baseline.checklist = buildFieldChecklist(baseline, ctx);
  baseline.strategy = {
    id: 'baseline',
    title: 'Current Baseline (Status Quo)',
    description: isMonoculture
      ? `Your current crop repeated for ${rotationLength} seasons.`
      : `Your custom ${rotationLength}-season baseline rotation.`,
  };

  const isTropical = Math.abs(climate?.lat ?? 0) < 23.5;
  const zone = isTropical ? 'tropical' : 'temperate';
  const zoneCrops = crops.filter(
    (c) => !c.perennial && (!c.climateZones || c.climateZones.includes(zone))
  );
  const eligibleCrops = zoneCrops.length >= 4 ? zoneCrops : crops.filter((c) => !c.perennial);

  let pool = eligibleCrops.filter(
    (c) => ctx.scores[c.id].thermalFit > 0 && ctx.scores[c.id].envScore >= MIN_VIABLE_ENV_SCORE
  );
  if (pool.length < 4) pool = eligibleCrops.filter((c) => ctx.scores[c.id].yieldMultiplier > 0);
  if (pool.length < 4) pool = eligibleCrops;

  const baseCropSet = new Set(baseSeq);
  const baseHasStorable = baseSeq.some((id) => ctx.cropMap[id]?.perishability === 'storable');

  const buildCandidates = (strict, L) => {
    const out = [];
    function permute(currIds) {
      if (currIds.length === L) {
        const seqObjs = currIds.map((id) => ctx.cropMap[id]);
        const perishableCount = seqObjs.filter((x) => x.perishability === 'perishable').length;
        if (strict && perishableCount > 1) return;
        if (strict && baseHasStorable && !seqObjs.some((x) => baseCropSet.has(x.id))) return;

        const r = evaluateRotation(currIds, ctx);
        if (strict && r.badges.some((x) => x.id === 'moisture_depletion')) return;
        if (strict && r.resilienceScore < baseline.resilienceScore && r.waterRisk > baseline.waterRisk) return;
        out.push(r);
        return;
      }
      for (const crop of pool) {
        const prevId = currIds[currIds.length - 1];
        if (prevId === crop.id) continue;
        if (strict && prevId && ctx.cropMap[prevId].botanicalFamily === crop.botanicalFamily) continue;
        currIds.push(crop.id);
        permute(currIds);
        currIds.pop();
      }
    }
    permute([]);
    return out;
  };

  let candidates = buildCandidates(true, rotationLength);
  if (candidates.length < 3) candidates = buildCandidates(false, rotationLength);

  const usedSets = new Set();
  const adapted = [];
  for (const strategy of STRATEGIES) {
    const ranked = [...candidates].sort(SORTERS[strategy.id]);
    const preferred =
      strategy.id === 'profit'
        ? ranked.filter((r) => r.hasLegume)
        : ranked;
    const searchList = preferred.length ? preferred : ranked;

    const pick =
      searchList.find((r) => !usedSets.has([...new Set(r.sequence)].sort().join('|'))) ??
      ranked.find((r) => !adapted.some((x) => x.id === r.id));
    if (!pick) continue;
    usedSets.add([...new Set(pick.sequence)].sort().join('|'));
    const result = { ...pick, strategy, checklist: buildFieldChecklist(pick, ctx) };
    result.vsBaseline = compareToBaseline(result, baseline);
    adapted.push(result);
  }

  return {
    baseline,
    adapted,
    meta: {
      candidatesEvaluated: candidates.length,
      poolIds: pool.map((c) => c.id),
      excludedIds: crops.filter((c) => !pool.includes(c)).map((c) => c.id),
      dryland: ctx.annualRainMm < DRYLAND_RAIN_MM,
      rotationLength,
    },
  };
}