// Short display name for cards, tables and rotation labels.
// Uses the crop's own `shortName` when set (e.g. "Paddy Rice" vs "Upland Rice"), otherwise drops the
// bracketed detail: "Maize (Grain Corn)" -> "Maize".
export const shortCropName = (crop) => crop?.shortName ?? crop?.name?.split(' (')[0] ?? '';
