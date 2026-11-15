import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudSun,
  Coins,
  HelpCircle,
  Leaf,
  Loader2,
  MapPin,
  Repeat,
  SlidersHorizontal,
  Sprout,
  TrendingUp,
  TriangleAlert,
  Waves,
} from 'lucide-react';
import crops from './data/crops.json';
import { DEMO_PRESETS, DEFAULT_PRESET_ID, getPresetById } from './data/demoPresets.js';
import { fetchFarmClimate } from './utils/nasaApi.js';
import { fetchSiteEnvironment } from './utils/terrain.js';
import { scoreAllCrops } from './utils/cropScorer.js';
import FarmMap from './components/FarmMap.jsx';
import ClimateShiftTab from './components/ClimateShiftTab.jsx';
import CropFitTab from './components/CropFitTab.jsx';
import EconomicsTab, { DEFAULT_OVERRIDES } from './components/EconomicsTab.jsx';
import RotationTab from './components/RotationTab.jsx';
import FutureSimulatorTab from './components/FutureSimulatorTab.jsx';

const TABS = [
  { id: 'rotation', label: '1. Rotation Plan', icon: Repeat },
  { id: 'fit', label: '2. Crop Suitability', icon: Sprout },
  { id: 'econ', label: '3. Profit & Costs', icon: Coins },
  { id: 'climate', label: '4. Weather Trends', icon: CloudSun },
  { id: 'future', label: '5. Future Simulator', icon: TrendingUp },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

export default function App() {
  const initial = getPresetById(DEFAULT_PRESET_ID);
  const initialCrop = initial.currentCrop === 'rice' ? 'rice_paddy' : initial.currentCrop;

  const [lat, setLat] = useState(initial.lat);
  const [lon, setLon] = useState(initial.lon);
  const [presetId, setPresetId] = useState(initial.id);
  const [presetCrop, setPresetCrop] = useState(initialCrop);
  const [rotationLength, setRotationLength] = useState(3);
  const [baselineSequence, setBaselineSequence] = useState([initialCrop, initialCrop, initialCrop]);
  const [farmSizeHa, setFarmSizeHa] = useState(1);
  const [waterSupply, setWaterSupply] = useState(initial.id === 'mekong' ? 'irrigated' : 'rainfed');
  const [overrides, setOverrides] = useState(DEFAULT_OVERRIDES);
  const [tab, setTab] = useState('rotation');
  const [climate, setClimate] = useState(null);
  const [siteEnv, setSiteEnv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchFarmClimate(lat, lon).then((c) => {
      if (cancelled) return;
      setClimate(c);
      setLoading(false);
    });

    fetchSiteEnvironment(lat, lon).then((env) => {
      if (cancelled) return;
      setSiteEnv(env);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const ready = Boolean(climate && !climate.isWaterBody);
  const scored = useMemo(
    () => (ready ? scoreAllCrops(crops, climate, { waterSupply }) : []),
    [ready, climate, waterSupply]
  );
  const activePreset = useMemo(() => DEMO_PRESETS.find((p) => p.id === presetId), [presetId]);

  const handleRotationLengthChange = (newLen) => {
    setRotationLength(newLen);
    setBaselineSequence((prev) => {
      if (prev.length === newLen) return prev;
      if (newLen > prev.length) {
        const last = prev[prev.length - 1] || presetCrop;
        return [...prev, ...Array(newLen - prev.length).fill(last)];
      }
      return prev.slice(0, newLen);
    });
  };

  const handlePreset = (p) => {
    const normalizedCrop = p.currentCrop === 'rice' ? 'rice_paddy' : p.currentCrop;
    setLat(p.lat);
    setLon(p.lon);
    setPresetId(p.id);
    setPresetCrop(normalizedCrop);
    setBaselineSequence(Array(rotationLength).fill(normalizedCrop));
    setWaterSupply(p.id === 'mekong' ? 'irrigated' : 'rainfed');
  };

  const handleMapSelect = (la, lo) => {
    setLat(la);
    setLon(lo);
    setPresetId(null);

    const isTropical = Math.abs(la) < 23.5;
    const defaultCrop = isTropical ? 'rice_paddy' : 'maize';
    if (baselineSequence.every((c) => c === baselineSequence[0])) {
      setPresetCrop(defaultCrop);
      setBaselineSequence(Array(rotationLength).fill(defaultCrop));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">AgriGate</h1>
              <p className="text-xs text-slate-500">Simple Crop Rotation &amp; Weather Advisor</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    active
                      ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        {/* Quick Start Farmer Guide Banner */}
        {guideOpen ? (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-5 py-4 text-xs text-emerald-950">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                <HelpCircle className="h-4 w-4 text-emerald-600" />
                How to use AgriGate in 3 quick steps
              </span>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="font-semibold text-emerald-700 hover:underline"
              >
                Hide guide
              </button>
            </div>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-200/60">
                <span className="font-bold text-emerald-700">Step 1 · Set Your Farm</span>
                <p className="mt-1 text-slate-600">
                  Click <strong>Set Farm Location &amp; Water</strong> below to pin your field on the map, enter your area (ha), and choose Rainfed or Irrigated.
                </p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-200/60">
                <span className="font-bold text-emerald-700">Step 2 · Pick Your Goal &amp; Crops</span>
                <p className="mt-1 text-slate-600">
                  Select your main priority (Soil Health, Water Saving, or Profit) and enter the crops you currently plant each season.
                </p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-200/60">
                <span className="font-bold text-emerald-700">Step 3 · Review &amp; Simulate</span>
                <p className="mt-1 text-slate-600">
                  Compare your current crops against our suggested rotation, check local prices, or test future warming in <strong>Future Simulator</strong>.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" /> Show 3-step instructions
            </button>
          </div>
        )}

        {/* Farm Location & Water Context Card */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                <MapPin className="h-4 w-4 text-emerald-600" />
                {activePreset ? activePreset.label : `Custom Field (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`}
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-medium text-slate-600">{farmSizeHa} ha</span>
              {siteEnv?.elevationM !== null && siteEnv?.elevationM !== undefined && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{siteEnv.elevationM}m elevation</span>
                </>
              )}
              <span className="rounded-md bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                {waterSupply === 'irrigated' ? 'Irrigated Farm' : 'Rainfed Farm'}
              </span>
              {loading && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking local weather…
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" />
              {contextOpen ? 'Save & Close Map' : 'Set Farm Location & Water'}
              {contextOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {contextOpen && (
            <div className="grid gap-5 border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <FarmMap
                  lat={lat}
                  lon={lon}
                  onSelect={handleMapSelect}
                  presets={DEMO_PRESETS}
                  activePresetId={presetId}
                  onPreset={handlePreset}
                  loading={loading}
                />
              </div>
              <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
                <h2 className="text-sm font-bold text-slate-900">Your Farm Details</h2>
                <p className="mt-1 mb-4 text-xs text-slate-500">
                  Tell us how you water your crops and your total field area so we can tailor crop fit and profit totals.
                </p>

                <div className="space-y-4">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">How are your crops watered?</span>
                    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                      {[
                        { id: 'rainfed', label: 'Rainfed (Rain only)' },
                        { id: 'irrigated', label: 'Irrigated (Canals/Pumps)' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setWaterSupply(opt.id)}
                          className={`rounded-md py-2 text-xs font-semibold transition ${
                            waterSupply === opt.id
                              ? 'bg-white text-emerald-700 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Field Size (hectares)</span>
                    <input
                      type="number"
                      min={0.1}
                      max={100000}
                      step={0.5}
                      value={farmSizeHa}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setFarmSizeHa(Number.isFinite(val) && val > 0 ? val : 1);
                      }}
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Alerts & Loading States */}
        {climate?.isFallback && !loading && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Live satellite weather could not be reached ({climate.fallbackReason}). Showing typical weather for{' '}
              <strong>{climate.fallbackRegion}</strong> — click the map to retry.
            </span>
          </div>
        )}

        {loading && !climate && (
          <div className="flex min-h-[320px] items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-xs">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Loading 20 years of local satellite weather…
          </div>
        )}

        {climate?.isWaterBody && (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-6 text-center">
            <Waves className="h-8 w-8 text-sky-600" />
            <p className="font-semibold text-sky-950">This pin is over water</p>
            <p className="max-w-md text-sm text-sky-800">
              Click <strong>Set Farm Location &amp; Water</strong> above and drop the pin onto farmland.
            </p>
          </div>
        )}

        {/* Active Tab Workspace */}
        {ready && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {tab === 'rotation' && (
              <RotationTab
                crops={crops}
                climate={climate}
                presetCrop={presetCrop}
                baselineSequence={baselineSequence}
                onBaselineSequenceChange={setBaselineSequence}
                rotationLength={rotationLength}
                onRotationLengthChange={handleRotationLengthChange}
                farmSizeHa={farmSizeHa}
                waterSupply={waterSupply}
                elevationM={siteEnv?.elevationM ?? null}
                overrides={overrides}
                onOpenEconomics={() => setTab('econ')}
              />
            )}
            {tab === 'fit' && <CropFitTab scored={scored} />}
            {tab === 'econ' && (
              <EconomicsTab
                scored={scored}
                overrides={{ ...overrides, waterSupply }}
                onOverridesChange={setOverrides}
                currentCrop={baselineSequence[0]}
              />
            )}
            {tab === 'climate' && <ClimateShiftTab climate={climate} />}
            {tab === 'future' && (
              <FutureSimulatorTab
                crops={crops}
                climate={climate}
                baselineSequence={baselineSequence}
                rotationLength={rotationLength}
                waterSupply={waterSupply}
                elevationM={siteEnv?.elevationM ?? null}
                overrides={overrides}
              />
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        Weather data from NASA POWER · Crop baselines from FAO GAEZ &amp; FAOSTAT. Always verify with local seed suppliers and extension advisors.
      </footer>
    </div>
  );
}