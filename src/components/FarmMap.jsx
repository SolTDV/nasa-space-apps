import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, MapPin, Zap } from 'lucide-react';

// Custom CSS pin (see .fs-pin in index.css) instead of Leaflet's default PNG icons.
const pinIcon = L.divIcon({
  className: '',
  html: '<div class="fs-pin"></div>',
  iconSize: [26, 26],
  iconAnchor: [4, 30],
});

const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect(Number(e.latlng.lat.toFixed(4)), Number(wrapLng(e.latlng.lng).toFixed(4)));
    },
  });
  return null;
}

function Recenter({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], Math.max(map.getZoom(), 6), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);
  return null;
}

export default function FarmMap({ lat, lon, onSelect, presets, activePresetId, onPreset, loading }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MapPin className="h-4 w-4 text-emerald-500" /> Farm Location
        </h2>
        {loading && (
          <span className="flex items-center gap-1 text-xs text-sky-700">
            <Loader2 className="h-3 w-3 animate-spin" /> Fetching NASA POWER…
          </span>
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPreset(p)}
            title={p.story}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
              activePresetId === p.id
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800'
                : 'border-slate-300 text-slate-700 hover:border-slate-500'
            }`}
          >
            <Zap className="h-3 w-3" /> {p.shortLabel}
          </button>
        ))}
      </div>

      <div className="h-64 min-h-[256px] overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={[lat, lon]} zoom={5} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lon]} icon={pinIcon} />
          <ClickHandler onSelect={onSelect} />
          <Recenter lat={lat} lon={lon} />
        </MapContainer>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        <span className="font-mono text-slate-700">
          {lat.toFixed(3)}°, {lon.toFixed(3)}°
        </span>{' '}
        — click the map to drop a pin, or load a demo farm.
      </p>
    </div>
  );
}
