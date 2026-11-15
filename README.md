# AgriGate — Adaptive Crop Rotation Decision Support
NASA Space Apps 2026 · React 18 + Vite + Tailwind · 100% client-side (one live call to NASA POWER).

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # production build -> dist/

Tests (no framework needed):
    node scripts/smoke.mjs     # parser, fallback, scorer, rotation engine on the 3 demo farms
    node scripts/soil.mjs      # hidden soil-moisture model behind the Future Simulator verdict
    npx esbuild scripts/mount.jsx --bundle --platform=node --format=esm --jsx=automatic --loader:.js=jsx \
      --external:./domsetup.mjs --external:jsdom --external:react --external:react-dom \
      --external:react-dom/client --external:react-leaflet --external:leaflet --external:recharts \
      --external:lucide-react --outfile=scripts/mount.bundle.mjs && node scripts/mount.bundle.mjs

## Estimated irrigation cost

When the farm is set to **Irrigated**, every crop pays an *estimated irrigation cost* per hectare per season
(pumping energy, fuel, water/canal fees) by its water need: low 45 $/ha, medium 95 $/ha, high 160 $/ha
(`IRRIGATION_COST_HA` in `src/utils/cropScorer.js`). **These values are an assumption** for the demo, not taken
from a published dataset. The Profit & Costs tab has an "Estimated irrigation cost" slider (0–300 %) so farmers
can change it to their own cost; it is not reduced by the legume nitrogen credit.

## Soil Water Outlook (Future Simulator)

Farmers see one plain verdict ("Watch out in Feb–Mar", "Water shortage risk") plus a 12-month strip.
Behind it, `src/utils/soilMoistureModel.js` trains a small linear model in the browser on the field's own
NASA POWER monthly history (2006–2025):

- **Learns:** root-zone wetness anomaly (GWETROOT) from rain anomalies this month and the two months before
  (soil memory) plus the temperature anomaly. Anomalies are departures from each calendar month's average.
- **Checked:** leave-one-year-out. Share of year-to-year moisture swings explained on unseen years, real NASA data:
  Can Tho 0.71, Ca Mau 0.61, Buon Ma Thuot 0.82, Iowa 0.48, Kansas 0.62.
  Above 0.3 the verdict is shown, 0.1–0.3 it is labelled "Rough estimate", below 0.1 it is hidden.
- **Physical limits:** more rain may never dry the soil and warming may never wet it (coefficients are clipped).
- **Dry month:** predicted wetness below that month's driest-20% level, at least 3 points below today, and under 0.7.
- **Honest limits:** GWETROOT is itself modelled (MERRA-2, ~50 km grid); the model learns statistical links, not soil
  physics; scenarios beyond the driest/hottest year on record are flagged as a rough guide.
