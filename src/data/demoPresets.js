// One-click demo farms for instant testing and live demos.
// Soil fields default to "Unknown" on purpose: soil knowledge belongs to the farmer.

export const DEMO_PRESETS = [
  {
    id: 'mekong',
    label: 'Mekong Delta Rice Farm',
    shortLabel: 'Mekong Delta',
    region: 'Mekong Delta, Vietnam',
    lat: 10.045,
    lon: 105.746,
    currentCrop: 'rice_paddy',
    soilTexture: 'Unknown',
    soilPh: 'Unknown',
    slopingLand: false,
    zoom: 8,
    story:
      'Hot, humid, rice-dominated delta. Watch heat-stress months and how rainfall timing is shifting.',
  },
  {
    id: 'iowa',
    label: 'Iowa Corn Monoculture',
    shortLabel: 'Iowa Corn Belt',
    region: 'Corn Belt, Iowa, USA',
    lat: 42.03,
    lon: -93.631,
    currentCrop: 'maize',
    soilTexture: 'Unknown',
    soilPh: 'Unknown',
    slopingLand: false,
    zoom: 7,
    story:
      'Continuous maize invites pest and disease pressure. A legume in the rotation shows nitrogen savings.',
  },
  {
    id: 'kansas',
    label: 'Kansas High Plains Wheat',
    shortLabel: 'Kansas Dryland',
    region: 'Western Kansas, USA',
    lat: 38.48,
    lon: -100.9,
    currentCrop: 'winter_wheat',
    soilTexture: 'Unknown',
    soilPh: 'Unknown',
    slopingLand: false,
    zoom: 7,
    story:
      'Dryland regime (<550 mm/yr). Moisture carryover and water-smart rotations matter most here.',
  },
];

export const DEFAULT_PRESET_ID = 'iowa';

export function getPresetById(id) {
  return DEMO_PRESETS.find((p) => p.id === id) ?? null;
}
