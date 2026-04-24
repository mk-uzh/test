# 🏔️ TrailSafe — map & conditions overview

**One more tool to inform your planning** — a topographic map (OpenTopoMap) with **risk estimates based on available environmental data** (demo CSV + heuristics), weather fields, and gear checklists. Not a safety guarantee; always use official sources.

## 🗺️ Real trails & peaks (OpenStreetMap)

Use **Search** with a place or **mountain name** (Nominatim geocoding — we prefer `natural=peak` / volcano / ridge hits when OSM returns them). The app loads:

- **Named paths / footways** (trail lines) via Overpass  
- **Named peaks** (`natural=peak`, nodes and ways with a name) in the same area  

Distances in the lists are from your **search point** (or the map view center, depending on context). Peaks appear as ▲ markers; trail segments use a status **colour** legend (indicator bands, not a safety verdict).  
Please use geocoding and Overpass **lightly** (no automated bulk requests).

---

## ▶️ How to run (with login and API)

> **Do not** open `index.html` as `file://` — the app needs HTTP for `fetch()` (CSVs, OSM) and the **/api** routes.

**Recommended — FastAPI (SQLite by default, bcrypt, registration, session cookie):** see [`server/README.md`](server/README.md) for `DATABASE_URL` / optional MariaDB and:

```bash
cd trailsafe
py -3 -m pip install -r server/requirements.txt
py -3 -m uvicorn server.main:app --host 127.0.0.1 --port 8000
# Open: http://127.0.0.1:8000  →  login / register, then the dashboard
```

(No Docker required; a `trailsafe.db` file is created on first use.)

A plain static server does **not** provide `/api/auth/*`; the main page expects a logged-in session.

---

## 📁 Project Structure

```
trailsafe/
├── index.html
├── css/style.css
├── js/app.js
└── data/
    ├── trails.csv
    ├── weather.csv
    ├── incidents.csv
    ├── environment.csv
    ├── complexity.csv
    ├── predictions.csv   ← risk indicators (demo; swap for your model)
    └── waypoints.csv     ← segments + segment_status for map colours
```

---

## ⚙️ Risk **indicators** (not accurate scores)

- **Primary display:** `predictions.csv` → `blended_risk_0_10` (placeholder; **Risk indicators based on historical and weather data** when you wire a model).
- **Comparison:** a rule-based heuristic in `app.js` (`riskScoreHeuristic`) using merged CSV fields.

Weighted heuristic factors (0–10):

| Factor               | Weight |
|----------------------|--------|
| Trail difficulty     | 25%    |
| Elevation gain       | 20%    |
| Historical incidents | 20%    |
| Weather              | 20%    |
| Visibility           | 15%    |

---

## ✏️ Customising data

Edit CSVs under `data/`. Join key is `trail_id` (or `id` in `trails.csv`). After changes, reload the app (local server).

---

## 🛠️ Tech stack

- **Leaflet.js** — map; **OpenTopoMap** tiles  
- **Vanilla JS** — no build step  
- **Google Fonts** — Outfit + DM Sans  
- **localStorage** — gear checklist state  

Public copy avoids implied guarantees (e.g. not “**AI-powered safety**”); describe the product as **AI-assisted environmental awareness** and **risk estimates based on available environmental data**.

## Compliance records

- OpenWeather pre-commercial checklist: `docs/compliance/OPENWEATHER_API_COMPLIANCE_CHECKLIST.md`
- AI system classification + launch state-of-the-art record: `docs/compliance/AI_SYSTEM_CLASSIFICATION_ASSESSMENT.md`

> **Note:** An older **nested** `trailsafe/` copy may remain in the repo from a previous upload. The **canonical** app in this project is the **repository root** (this README, `index.html`, `server/`, `js/`, `data/`).
