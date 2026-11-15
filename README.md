# FieldShift — Adaptive Crop Rotation Decision Support
NASA Space Apps 2026 · React 18 + Vite + Tailwind · 100% client-side (one live call to NASA POWER).

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # production build -> dist/

Tests (no framework needed):
    node scripts/smoke.mjs     # parser, fallback, scorer, rotation engine on the 3 demo farms
    npx esbuild scripts/mount.jsx --bundle --platform=node --format=esm --jsx=automatic --loader:.js=jsx \
      --external:./domsetup.mjs --external:jsdom --external:react --external:react-dom \
      --external:react-dom/client --external:react-leaflet --external:leaflet --external:recharts \
      --external:lucide-react --outfile=scripts/mount.bundle.mjs && node scripts/mount.bundle.mjs
