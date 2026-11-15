// Lightweight terrain elevation lookup via Open-Meteo SRTM Elevation API (~50ms, keyless).

const elevCache = new Map();

export async function fetchSiteEnvironment(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (elevCache.has(key)) return elevCache.get(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const rawElev = Array.isArray(data?.elevation) ? data.elevation[0] : null;
    const result = {
      elevationM: Number.isFinite(rawElev) ? Math.round(rawElev) : null,
    };

    elevCache.set(key, result);
    return result;
  } catch {
    return { elevationM: null };
  } finally {
    clearTimeout(timer);
  }
}
