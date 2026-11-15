# FieldShift: Features and How Farmers Use It

**FieldShift turns 20 years of NASA POWER climate data for a farmer's own field into three answers:
what to plant next, whether it pays, and how the plan holds up in a hotter, drier future.**

Live app: https://nasa-space-apps-blond.vercel.app/ · Built for NASA Space Apps Challenge 2026, challenge
*Field Shift: Adapting Farms with NASA Data*.

---

## The problem

Many farms grow the same crop season after season: rice after rice in the Mekong Delta, corn after corn in
Iowa, wheat after wheat on the Kansas plains. Monoculture drains soil nitrogen, lets pests build up, and leaves
the farm exposed when a dry or hot year arrives. Farmers know rotation helps, but they lack a quick way to see
which rotation fits *their* weather, *their* water, and *their* prices.

## How it works

```
Pin your field ──► NASA POWER (monthly, 2006–2025) + elevation
                      │
                      ▼
        Crop fit for 32 crops (temperature, rain, soil moisture, sunlight)
                      │
                      ▼
        Rotation engine (2–4 seasons, agronomic rules) ──► Profit check (your prices)
                      │
                      ▼
        Future Simulator (warmer / drier scenarios + soil water outlook)
```

- One live call to NASA POWER per location. No account, no server, no API key: everything runs in the browser.
- If NASA does not answer within 8 seconds, the app shows typical regional weather and says so in a banner.

### Data sources

| Source | What we use | What it is for |
|---|---|---|
| NASA POWER `T2M`, `T2M_MAX`, `T2M_MIN` | Monthly air temperature | Crop temperature fit, heat-stress months |
| NASA POWER `PRECTOTCORR` | Monthly rainfall | Rain fit, dryland and waterlogging rules |
| NASA POWER `GWETROOT` | Root-zone soil wetness | Moisture fit, soil water outlook |
| NASA POWER `ALLSKY_SFC_SW_DWN` | Sunlight reaching the ground | Light fit for crops |
| Open-Meteo (SRTM) | Elevation | Shown with the farm details |
| FAO GAEZ / FAOSTAT | Crop temperature and water ranges, yields, prices | Crop thresholds and profit baselines |

---

## Features

### Set up your farm (top of every screen)
- **Three demo farms** for a one-click start: Mekong Delta rice, Iowa corn monoculture, Kansas dryland wheat.
- **Drop a pin anywhere** on the map. The app suggests paddy rice in the tropics and maize elsewhere as a
  starting crop.
- **Water and size:** rainfed or irrigated, farm area in hectares. Elevation is filled in automatically.
- **Safety nets:** a pin over water asks you to move it; a slow connection shows clearly labelled typical weather.
- **3-step guide** at the top explains what to do, and can be hidden.

### 1. Rotation Plan
- Choose **2, 3 or 4 seasons** and **one goal**: All-Round Balance, Break Pests & Build Soil, Save Water & Beat
  Drought, or Higher Profit & Less Fertilizer.
- Enter **what you grow now**, season by season, with a searchable crop picker. Each season shows its weather fit.
- Get a **suggested rotation** that is always different from, and better than, your current plan, with plain
  reasons ("includes a nitrogen-fixing legume", "mixes shallow and deep roots").
- **Before and after cards:** Soil & Pest Health, Drought & Water Risk, Estimated Profit, Fertilizer Saved.
- **Agronomic rules behind the score:** nitrogen synergy (a legume before a heavy feeder earns a 15% fertilizer
  credit), pest and disease break across plant families, soil structure from root depth and residue, weed
  suppression, soil-moisture carryover (stricter below 550 mm of rain a year, waterlogging checks above
  1,100 mm), and farm soil and terrain modifiers.
- **Before You Plant checklist:** what NASA data cannot see (soil pH, texture, pest history, seed and labour
  availability), so the farmer checks it on the ground.
- **Technical comparison** of pests, nitrogen, roots and weeds for anyone who wants the detail.

### 2. Crop Suitability
- **32 crops ranked** for this field. Weather fit combines temperature (35%), rainfall (30%), root-zone
  moisture (20%) and sunlight (15%).
- Each crop shows its **best planting window** and its **main watch-out** (temperature, rain, moisture or light).
- Filters: all crops, great matches (75%+), warm-season, cool-season. Irrigation softens rain and moisture limits.

### 3. Profit & Costs
- Start from FAOSTAT yields and prices, then **adjust to the local market**: selling price (−40% to +50%),
  seed and fertilizer costs (−40% to +50%), and **distance to the buyer** (under 20 km, 20–100 km, over 100 km),
  which raises spoilage risk for fresh produce.
- A table of **estimated yield, sales, input costs and net profit per hectare**, sorted from best to worst,
  with your current crop marked.

### 4. Weather Trends
- **Recent 5 years (2021–2025) against the 20-year baseline (2006–2025)** for this exact location: shift in
  mean temperature, rainfall (%), root-zone wetness, and the number of heat-stress months (above 34 °C).
- Month-by-month charts for temperature, rainfall, soil moisture and sunlight, to see *when* the change happens.

### 5. Future Simulator
- **Scenario buttons:** 2040 moderate (+1.5 °C, −3% rain), 2040 high warming (+2.2 °C, −8%), 2060 hot and dry
  (+3.2 °C, −15%), and a **local trend projection** extended from this field's own 20-year change. The first three
  are illustrative shifts in the range of IPCC scenarios, not downscaled model output.
- **Sliders** for temperature (0 to +4.5 °C) and annual rainfall (−35% to +25%).
- **Crops losing weather fit**, **climate-resilient picks**, and a **future-proof rotation** side by side with
  the current plan in the same future weather.
- **Soil Water Outlook:** one plain verdict ("No extra water risk", "Watch out in Feb–Mar", "Water shortage
  risk"), a 12-month strip showing which months turn dry, and one or two actions naming the farmer's own crops
  ("switch to mung bean", "store water before February", "plan extra irrigation in March").
  - Behind it, a small model is trained in the browser on the field's own NASA history: root-zone wetness
    explained by this month's rain, the two previous months' rain (soil memory) and temperature.
  - Each year is checked by a model that never saw it. On real NASA POWER data the model explains 71% of
    year-to-year soil-moisture swings in Can Tho, 61% in Ca Mau, 82% in Buon Ma Thuot and 49% in Iowa.
  - Farmers never see these numbers. Where the model is weak the card says "Rough estimate" or stays hidden;
    scenarios beyond any year on record are marked as a rough guide.

---

## How it is used

**A rice farmer in Ca Mau (Mekong Delta).** She keeps the default plan, rice every season, and opens the Future
Simulator. Under the moderate 2040 scenario, the Soil Water Outlook on real NASA data reads *"Watch out in
Feb–Mar"*: the dry-season months her second crop depends on. The Rotation Plan suggests putting a short,
low-water legume such as mung bean into that slot, and the Profit tab shows what it earns at her local price.
Decision: change one season, store water before February, and check salinity before taking canal water.

**A corn grower in Iowa.** Continuous corn scores poorly on Soil & Pest Health. With the "Higher Profit & Less
Fertilizer" goal the suggested rotation brings in a legume. The Fertilizer Saved card shows the nitrogen saving,
and the checklist reminds him to soil-test nitrogen and use the right rhizobia inoculant before cutting fertilizer.

**A dryland wheat farmer in Kansas.** The app recognises a dryland regime (under 550 mm of rain a year). The
"Save Water & Beat Drought" goal favours crops that leave moisture in the soil for the next season, and the
Weather Trends tab shows whether recent years have been drier or hotter than the 20-year normal.

**Extension officers, cooperatives and NGOs.** Drop pins across a district to compare villages in minutes, and
use the checklist and plain-language verdicts in farmer training sessions.

**Teachers and students.** Show how climate change appears in local NASA data, month by month, for any place
on Earth.

---

## Honest limits

- NASA POWER cells are about 50 km wide, so two neighbouring fields look the same.
- `GWETROOT` is itself modelled (MERRA-2), and the soil water model learns statistical links, not soil physics.
- NASA data cannot see soil pH, texture, salinity, pests or local prices; the checklist and the price sliders
  hand those back to the farmer.
- Scenario presets are illustrative, not downscaled climate projections.
- FieldShift supports a farmer's decision. It does not replace local extension advice.

## Under the hood

React 18 + Vite + Tailwind, Recharts for charts, Leaflet for the map, all client-side. Tests run without a
framework: `node scripts/smoke.mjs` (parser, fallback, scorer, rotation engine) and `node scripts/soil.mjs`
(soil water model).
