# 🏔️ TrailSafe — map & conditions overview (nested copy)

**One more tool to inform your planning** — a map, **risk estimates based on available environmental data**, route ideas, and condition fields. The **repository root** `README.md` describes the maintained app; this folder may be a legacy copy.

## Features
- 🗺️ **Interactive map** using Leaflet + OpenTopoMap (topographic tiles)
- 📊 **Risk indicators** — weighted heuristics (elevation, weather, terrain, incidents), not a professional assessment
- 🎒 **Gear checklist** — suggestions per route with priority labels
- 🌤️ **Weather & conditions** panel
- 🔍 **Search + filter** by **risk indicator** band (not a safety “status”)
- ✅ **Gear tracking** — checkboxes persist via localStorage

## Project Structure

The **canonical** app lives in the **repository parent**; this folder may be a legacy copy.

## How to Run

Prefer the project root: FastAPI as in the main `README.md` and `server/README.md` (this nested tree alone is not the primary setup).

## Data & model note

- **Risk levels** in CSV legacy docs used words like *Safe* / *Danger* — in the main app, copy uses **environmental / risk indicator** language instead of safety verdicts.

## Tech stack
- **Leaflet.js** — map (OpenTopoMap tiles)  
- **Vanilla JS**  
- **Google Fonts** — Outfit + DM Sans  
- **localStorage** — gear state  
