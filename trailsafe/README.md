# 🏔️ TrailSafe — Hiking Risk Intelligence App

A hiking trail safety dashboard with real map integration, dynamic risk scoring, gear checklists, and trail condition monitoring.

## Features
- 🗺️ **Real interactive map** using Leaflet + OpenTopoMap (topographic tiles)
- 📊 **Dynamic risk scoring** — weighted algorithm (elevation, weather, terrain, incidents)
- 🎒 **Gear checklist** — auto-generated per trail with priority levels
- 🌤️ **Weather & conditions** panel
- 🔍 **Search + filter** trails by safety status
- ✅ **Gear tracking** — checkboxes persist via localStorage

## Project Structure

```
trailsafe/
├── index.html          ← Main app entry point
├── css/
│   └── style.css       ← All styles
├── js/
│   └── app.js          ← App logic, risk engine, map, UI
└── data/
    ├── trails.csv      ← 10 dummy trails with conditions
    └── waypoints.csv   ← GPS waypoints for trail path drawing
```

## How to Run Locally

### Option 1 — Python (recommended, no install needed)

```bash
# Navigate to the project folder
cd trailsafe

# Python 3
python3 -m http.server 8080

# Then open in your browser:
# http://localhost:8080
```

### Option 2 — Node.js (npx, no install needed)

```bash
cd trailsafe
npx serve .
# Opens automatically, or visit http://localhost:3000
```

### Option 3 — VS Code Live Server

1. Open the `trailsafe/` folder in VS Code
2. Install the **Live Server** extension
3. Right-click `index.html` → **Open with Live Server**

> ⚠️ **Important:** You must run via a local server (not by opening `index.html` directly in a browser). The app loads CSV files via `fetch()`, which requires HTTP — direct file:// access will fail due to CORS.

## Risk Score Algorithm

The risk score (0–10) is computed from 5 weighted factors:

| Factor | Weight | Source |
|--------|--------|--------|
| Trail Difficulty | 25% | CSV `difficulty` field |
| Elevation Gain | 20% | CSV `elevation_gain_m` |
| Historical Incidents | 20% | CSV `incidents_last_year` |
| Weather Conditions | 20% | CSV `precipitation_chance`, `humidity_pct`, `wind_kmh` |
| Visibility | 15% | CSV `visibility_km` |

### Risk Levels
- 🟢 **0–3**: Low — Safe conditions
- 🟡 **3–5.5**: Moderate — Caution advised
- 🟠 **5.5–7.5**: High — Risk present
- 🔴 **7.5–10**: Extreme — Danger

## Customising the Data

Edit `data/trails.csv` to add your own trails. Key columns:
- `lat`, `lng` — coordinates (used to place markers on the map)
- `difficulty` — `Easy | Moderate | Hard | Expert`
- `status` — `Safe | Caution | Risk | Danger`
- `elevation_gain_m`, `distance_km` — trail metrics
- `precipitation_chance`, `wind_kmh`, `humidity_pct`, `visibility_km` — weather

Edit `data/waypoints.csv` to draw colored trail paths on the map:
- `trail_id` must match an `id` in `trails.csv`
- `segment_status` controls path color: `safe | caution | risk | danger`

## Tech Stack
- **Leaflet.js** — interactive map (OpenTopoMap tiles)
- **Vanilla JS** — no framework, no build step required
- **Google Fonts** — Outfit + DM Sans
- **localStorage** — gear checkbox persistence
