// Fetches free SRTM elevation (Open-Meteo) and topsoil properties (ISRIC SoilGrids v2.0)
// with graceful timeout and fallback to "Unknown" when unavailable.

const cache = new Map();

function classifyPh(ph) {
  if (ph === null || ph === undefined || Number.isNaN(ph)) return 'Unknown';
  if (ph < 6.0) return 'Acidic';
  if (ph <= 7.4) return 'Neutral';
  return 'Alkaline';
}

function classifyTexture(clayPct, sandPct) {
  if (clayPct === null || sandPct === null || Number.isNaN(clayPct) || Number.isNaN(sandPct)) {
    return 'Unknown';
  }
  if (clayPct >= 35) return 'Clay';
  if (sandPct >= 65 && clayPct < 20) return 'Sandy';
  return 'Loam';
}

async function fetchWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchElevation(lat, lon) {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
  const data = await fetchWithTimeout(url, 3500);
  const elev = Array.isArray(data?.elevation) ? data.elevation[0] : null;
  return typeof elev === 'number' ? Math.round(elev) : null;
}

async function fetchSoilGrids(lat, lon) {
  const params = new URLSearchParams({
    lon: lon.toFixed(4),
    lat: lat.toFixed(4),
    value: 'mean',
  });
  params.append('depth', '0-5cm');
  params.append('depth', '15-30cm');
  params.append('property', 'phh2o');
  params.append('property', 'clay');
  params.append('property', 'sand');
  params.append('property', 'soc');

  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?${params.toString()}`;
  const data = await fetchWithTimeout(url, 10000);
  const layers = data?.properties?.layers ?? [];

  const getTopsoilMean = (name) => {
    const layer = layers.find((l) => l.name === name);
    const vals = (layer?.depths ?? [])
      .map((d) => d?.values?.mean)
      .filter((v) => typeof v === 'number');
    if (!vals.length) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  };

  // SoilGrids units: phh2o in pH*10, clay/sand in g/kg (divide by 10 for %), soc in dg/kg (divide by 10 for g/kg)
  const rawPh = getTopsoilMean('phh2o');
  const rawClay = getTopsoilMean('clay');
  const rawSand = getTopsoilMean('sand');
  const rawSoc = getTopsoilMean('soc');

  const ph = rawPh !== null ? Math.round((rawPh / 10) * 10) / 10 : null;
  const clayPct = rawClay !== null ? Math.round(rawClay / 10) : null;
  const sandPct = rawSand !== null ? Math.round(rawSand / 10) : null;
  const socGKg = rawSoc !== null ? Math.round((rawSoc / 10) * 10) / 10 : null;

  return {
    ph,
    phClass: classifyPh(ph),
    clayPct,
    sandPct,
    textureClass: classifyTexture(clayPct, sandPct),
    socGKg,
    source: ph !== null || clayPct !== null ? 'ISRIC SoilGrids (0–30 cm)' : null,
  };
}

export async function fetchSiteEnvironment(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  const [elevRes, soilRes] = await Promise.allSettled([
    fetchElevation(lat, lon),
    fetchSoilGrids(lat, lon),
  ]);

  const elevationM = elevRes.status === 'fulfilled' ? elevRes.value : null;
  const soil =
    soilRes.status === 'fulfilled'
      ? soilRes.value
      : { ph: null, phClass: 'Unknown', clayPct: null, sandPct: null, textureClass: 'Unknown', socGKg: null, source: null };

  const result = {
    elevationM,
    isHighland: elevationM !== null && elevationM >= 400,
    ...soil,
  };

  cache.set(key, result);
  return result;
}
