// Classifies any site into an FAO GAEZ-style Agro-Ecological Zone (AEZ)
// and computes Length of Growing Period (LGP) in days from NASA POWER monthly data + elevation.

// Approximate growing-season days required per crop (fallback if not specified in crops.json)
const CROP_REQUIRED_LGP_DAYS = {
  rice_paddy: 120,
  maize: 115,
  soybean: 105,
  groundnut: 110,
  mung_bean: 75,
  cowpea: 80,
  chickpea: 100,
  lentil: 105,
  common_bean: 90,
  sorghum: 110,
  pearl_millet: 85,
  cassava: 240,
  sweet_potato: 120,
  potato: 105,
  taro: 180,
  sesame: 95,
  sunflower: 105,
  canola: 120,
  winter_wheat: 180,
  spring_wheat: 110,
  barley: 100,
  oats: 105,
  cotton: 150,
  sugarcane: 270,
  chili_pepper: 120,
  tomato: 105,
  cucumber: 70,
  onion: 110,
  cabbage: 95,
  alfalfa: 180,
  red_clover: 150,
};

export function getRequiredLgpDays(crop) {
  return crop.requiredLgpDays ?? CROP_REQUIRED_LGP_DAYS[crop.id] ?? 100;
}

/**
 * Compute FAO GAEZ-inspired Thermal Regime, Moisture Regime, and Length of Growing Period (LGP).
 */
export function classifyAgroEcologicalZone(climate, elevationM = null) {
  const monthly = climate?.recent5Yr?.monthly ?? [];
  const lat = Math.abs(climate?.lat ?? 0);
  const annualRainMm = climate?.recent5Yr?.annualRainMm ?? 0;
  const avgTempC = climate?.recent5Yr?.avgTempC ?? 20;

  if (!monthly.length) {
    return {
      aezCode: 'UNKNOWN',
      aezLabel: 'Unclassified Zone',
      thermalRegime: 'Unknown',
      moistureRegime: 'Unknown',
      lgpDays: 180,
      frostFreeMonths: 12,
    };
  }

  // 1. Frost-free & thermally active months (mean temp >= 5°C and min temp > 0°C)
  const frostFreeMonths = monthly.filter((m) => m.minTemp > 0 && m.temp >= 5).length;

  // 2. Moisture-available months (monthly rain >= 35mm or root-zone wetness >= 0.45)
  const moistMonths = monthly.filter((m) => m.rainMm >= 35 || m.gwetRoot >= 0.45).length;

  // Rainfed LGP is constrained by both thermal window and moisture window (minimum 60 days)
  const activeMonths = Math.max(2, Math.min(frostFreeMonths, Math.max(moistMonths, 3)));
  const lgpDays = Math.round(activeMonths * 30.4);

  // 3. Thermal regime classification
  const isHighland = elevationM !== null && elevationM >= 500 && lat < 25;
  let thermalRegime = 'Temperate';
  if (isHighland) {
    thermalRegime = 'Tropical Highland';
  } else if (lat < 23.5 && avgTempC >= 22) {
    thermalRegime = 'Tropics Warm';
  } else if (lat < 35 && avgTempC >= 16) {
    thermalRegime = 'Subtropics';
  } else {
    thermalRegime = 'Temperate Continental';
  }

  // 4. Moisture regime classification
  let moistureRegime = 'Sub-Humid';
  if (annualRainMm < 400) moistureRegime = 'Arid / Dryland';
  else if (annualRainMm < 650) moistureRegime = 'Semi-Arid';
  else if (annualRainMm < 1200) moistureRegime = 'Sub-Humid';
  else moistureRegime = 'Humid';

  return {
    aezLabel: `${thermalRegime} · ${moistureRegime}`,
    thermalRegime,
    moistureRegime,
    lgpDays,
    frostFreeMonths,
  };
}
