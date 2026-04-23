// ============================================================
// TrailSafe — CSV demo data + real OSM hikes (Overpass + Nominatim)
// Map: OpenTopoMap. Respect OSM/Nominatim usage policies (no heavy scraping).
// ============================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const HTTP_UA = { 'User-Agent': 'TrailSafe/1.0 (educational demo; local use)' };

let searchCenter = { lat: 47.3769, lng: 8.5417, label: 'Zürich (default)' };
let TRAILS = [];
let WAYPOINTS = {};
let map, markerGroup, pathGroup;
let selectedId = null;
let activeFilter = 'all';
let searchQ = '';
let dataSource = 'csv';
let MOUNTAINS = [];
let mountainGroup;
let mountainFilterQ = '';
let selectedMountainId = null;

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === ',' && !q) {
        vals.push(cur);
        cur = '';
      } else cur += c;
    }
    vals.push(cur);
    const o = {};
    headers.forEach((h, i) => {
      o[h] = (vals[i] !== undefined ? vals[i] : '').trim();
    });
    return o;
  });
}

function indexById(rows, idKey = 'trail_id') {
  const m = {};
  rows.forEach((r) => {
    const id = Number(r[idKey]);
    if (!Number.isNaN(id)) m[id] = r;
  });
  return m;
}

function buildWaypoints(rows) {
  const by = {};
  rows.forEach((r) => {
    const tid = Number(r.trail_id);
    if (Number.isNaN(tid)) return;
    if (!by[tid]) by[tid] = [];
    by[tid].push(r);
  });
  const out = {};
  Object.keys(by).forEach((tid) => {
    const segs = by[tid].sort((a, b) => Number(a.segment) - Number(b.segment));
    out[tid] = segs.map((s) => [
      parseFloat(s.lat),
      parseFloat(s.lng),
      String(s.segment_status || 'safe').toLowerCase(),
    ]);
  });
  return out;
}

function kmAway(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthKm(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += kmAway(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return d;
}

function sacToDifficulty(tags) {
  const s = (tags?.sac_scale || '').toLowerCase();
  if (s.includes('alpine_hiking') || s.includes('difficult_alpine')) return 'Expert';
  if (s.includes('demanding_mountain')) return 'Hard';
  if (s.includes('mountain_hiking')) return 'Moderate';
  if (s.includes('hiking')) return 'Easy';
  return 'Moderate';
}

function segmentStatuses(geometry) {
  const keys = ['safe', 'safe', 'caution', 'caution', 'risk', 'safe'];
  return geometry.map((_, i) => keys[i % keys.length]);
}

function syntheticFromOsmWay(el) {
  const tags = el.tags || {};
  const geom = el.geometry;
  if (!geom || geom.length < 2) return null;
  const statuses = segmentStatuses(geom);
  const pts = geom.map((n, i) => [n.lat, n.lon, statuses[i] || 'safe']);
  const dist = pathLengthKm(pts);
  if (dist < 0.15) return null;
  const mid = Math.floor(pts.length / 2);
  const lat = pts[mid][0];
  const lng = pts[mid][1];
  const id = 1000000 + el.id;
  const diff = sacToDifficulty(tags);
  const elev = Math.min(2200, Math.max(80, dist * 140));
  const t = {
    id,
    name: tags.name || 'Unnamed path',
    lat,
    lng,
    dist: Math.round(dist * 10) / 10,
    rating: 4.3,
    status: 'Caution',
    type: 'OSM',
    surf: tags.surface || 'mixed',
    water: tags.drinking_water === 'yes' ? 2 : 0,
    temp: 16,
    hum: 52,
    wind: 11,
    vis: 14,
    rain: 32,
    sky: 'Partly cloudy',
    pressure: 1015,
    updatedMin: 12,
    goodHiking: true,
    inc: 0,
    incNote: 'No incident dataset for OSM paths',
    canopy: 45,
    exposure: tags.exposure ? String(tags.exposure) : 'medium',
    soil: 'medium',
    envNote: tags.description ? String(tags.description).slice(0, 120) : 'OpenStreetMap contributor data',
    avalanche: tags.avalanche === 'yes' ? 'moderate' : 'none',
    diff,
    elev: Math.round(elev),
    technical: Math.min(10, 3.5 + dist * 0.35 + (diff === 'Expert' ? 2 : 0)),
    narrow: ['narrow', 'yes'].includes(String(tags.width || '').toLowerCase()),
    rockiness: tags.surface === 'rock' || tags.surface === 'stone' ? 'high' : 'medium',
    complexityNote: tags.description
      ? String(tags.description).slice(0, 140)
      : 'Geometry from OpenStreetMap (estimate risk locally).',
    predictionRisk: null,
    predictionConf: null,
    predictionNote: 'Heuristic risk only — wire your model for OSM trails later.',
    source: 'osm',
    osmWayId: el.id,
  };
  const r = riskScoreHeuristic(t);
  t.status = riskToStatus(r);
  return { trail: t, points: pts };
}

function riskToStatus(r) {
  if (r <= 3) return 'Safe';
  if (r <= 5.5) return 'Caution';
  if (r <= 7.5) return 'Risk';
  return 'Danger';
}

function mergeTrailRows(trails, weather, incidents, env, complexity, predictions) {
  const w = indexById(weather);
  const inc = indexById(incidents);
  const e = indexById(env);
  const c = indexById(complexity);
  const p = indexById(predictions);

  return trails.map((t) => {
    const id = Number(t.id);
    const wt = w[id] || {};
    const ic = inc[id] || {};
    const ev = e[id] || {};
    const cx = c[id] || {};
    const pr = p[id] || {};

    return {
      id,
      name: t.name,
      lat: parseFloat(t.lat),
      lng: parseFloat(t.lng),
      dist: parseFloat(t.distance_km),
      rating: parseFloat(t.rating),
      status: t.status,
      type: t.trail_type,
      surf: t.surface,
      water: parseInt(t.water_sources, 10) || 0,
      temp: parseFloat(wt.temp_c) || 15,
      hum: parseFloat(wt.humidity_pct) || 50,
      wind: parseFloat(wt.wind_kmh) || 10,
      vis: parseFloat(wt.visibility_km) || 15,
      rain: parseFloat(wt.precipitation_pct) || 30,
      sky: wt.sky_condition || '—',
      pressure: parseFloat(wt.pressure_hpa) || 1013,
      updatedMin: parseInt(wt.updated_min_ago, 10) || 0,
      goodHiking: (wt.good_hiking || '').toLowerCase() === 'yes',
      inc: parseInt(ic.incidents_last_year, 10) || 0,
      incNote: ic.severity_note || '',
      canopy: parseInt(ev.canopy_pct, 10) || 0,
      exposure: ev.exposure || 'medium',
      soil: ev.soil_stability || 'medium',
      envNote: ev.wildlife_notes || '',
      avalanche: ev.avalanche_risk || 'none',
      diff: cx.difficulty || 'Moderate',
      elev: parseFloat(cx.elevation_gain_m) || 0,
      technical: parseFloat(cx.technical_score_1_10) || 5,
      narrow: (cx.narrow_passages || '').toLowerCase() === 'yes',
      rockiness: cx.rockiness || 'medium',
      complexityNote: cx.notes || '',
      predictionRisk:
        pr.blended_risk_0_10 !== undefined && pr.blended_risk_0_10 !== ''
          ? parseFloat(pr.blended_risk_0_10)
          : null,
      predictionConf: pr.confidence_0_1 !== undefined ? parseFloat(pr.confidence_0_1) : null,
      predictionNote: pr.model_note || '',
      source: 'csv',
    };
  });
}

function riskScoreHeuristic(t) {
  const diffMap = { Easy: 2, Moderate: 4.5, Hard: 7.5, Expert: 9.5 };
  const diffS = diffMap[t.diff] || 5;
  const elevS = Math.min(10, t.elev / 150);
  const incS = Math.min(10, t.inc * 1.2);
  const precipS = (t.rain / 100) * 10;
  const humS = (t.hum / 100) * 5;
  const windS = Math.min(10, t.wind / 4);
  const weatherS = precipS * 0.5 + humS * 0.25 + windS * 0.25;
  const visS = Math.max(0, 10 - t.vis * 0.4);
  const raw = diffS * 0.25 + elevS * 0.2 + incS * 0.2 + weatherS * 0.2 + visS * 0.15;
  return Math.min(10, Math.max(1, parseFloat(raw.toFixed(1))));
}

function displayRisk(t) {
  if (t.predictionRisk !== null && !Number.isNaN(t.predictionRisk)) return t.predictionRisk;
  return riskScoreHeuristic(t);
}

function riskMeta(s) {
  if (s <= 3) return { label: 'Low', color: '#22c55e', cls: 'safe' };
  if (s <= 5.5) return { label: 'Moderate', color: '#f59e0b', cls: 'caution' };
  if (s <= 7.5) return { label: 'High', color: '#f97316', cls: 'risk' };
  return { label: 'Very high', color: '#ef4444', cls: 'danger' };
}

const STATUS_COLOR = { Safe: '#22c55e', Caution: '#f59e0b', Risk: '#f97316', Danger: '#ef4444' };
const SEG_COLOR = { safe: '#22c55e', caution: '#f59e0b', risk: '#f97316', danger: '#ef4444' };

function skyEmoji(sky) {
  const s = (sky || '').toLowerCase();
  if (s.includes('storm')) return '⛈️';
  if (s.includes('fog')) return '🌫️';
  if (s.includes('cloud')) return '⛅';
  if (s.includes('clear') || s.includes('sun')) return '☀️';
  if (s.includes('overcast')) return '☁️';
  return '🌤️';
}

function setAreaLabel(text) {
  const el = document.getElementById('sb-area-label');
  if (el) el.textContent = text;
}

function setSearchCenter(lat, lng, label) {
  searchCenter = { lat, lng, label: label || 'Search' };
  setAreaLabel(`Near: ${searchCenter.label}`);
}

async function nominatimSearch(q) {
  const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(q)}&limit=12&addressdetails=0`;
  const res = await fetch(url, { headers: { ...HTTP_UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!data.length) throw new Error('Place or mountain not found');
  const peakFirst = data.find(
    (x) =>
      x.class === 'natural' &&
      ['peak', 'volcano', 'ridge', 'cliff', 'saddle'].includes(x.type)
  );
  const p = peakFirst || data[0];
  const lat = parseFloat(p.lat);
  const lon = parseFloat(p.lon);
  let south;
  let north;
  let west;
  let east;
  if (p.boundingbox && p.boundingbox.length >= 4) {
    south = parseFloat(p.boundingbox[0]);
    north = parseFloat(p.boundingbox[1]);
    west = parseFloat(p.boundingbox[2]);
    east = parseFloat(p.boundingbox[3]);
  } else {
    const pad = 0.06;
    south = lat - pad;
    north = lat + pad;
    west = lon - pad;
    east = lon + pad;
  }
  const pad = 0.02;
  return {
    lat,
    lon,
    displayName: p.display_name || q,
    south: south - pad,
    west: west - pad,
    north: north + pad,
    east: east + pad,
  };
}

async function overpassNamedPaths(south, west, north, east) {
  const q = `[out:json][timeout:55];
(
  way["highway"="path"]["name"](${south},${west},${north},${east});
  way["highway"="footway"]["name"](${south},${west},${north},${east});
  way["highway"="steps"]["name"](${south},${west},${north},${east});
);
out geom;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...HTTP_UA },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass request failed');
  return res.json();
}

async function overpassPeaks(south, west, north, east) {
  const q = `[out:json][timeout:45];
(
  node["natural"="peak"]["name"](${south},${west},${north},${east});
);
out body;
(
  way["natural"="peak"]["name"](${south},${west},${north},${east});
);
out center;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...HTTP_UA },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass peaks request failed');
  return res.json();
}

function parsePeaksFromOverpass(json) {
  const raw = [];
  for (const el of json.elements || []) {
    let lat;
    let lon;
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      lat = el.lat;
      lon = el.lon;
    } else if (el.type === 'way' && el.center) {
      lat = el.center.lat;
      lon = el.center.lon;
    } else continue;
    const name = el.tags?.name;
    if (!name) continue;
    let ele = null;
    if (el.tags?.ele != null) {
      const e = String(el.tags.ele).replace(/,/g, '.');
      const n = parseFloat(e);
      if (!Number.isNaN(n)) ele = Math.round(n);
    }
    raw.push({ name, lat, lon, ele, osmId: el.id, osmType: el.type });
  }
  const byName = new Map();
  for (const p of raw) {
    const k = p.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, p);
  }
  return Array.from(byName.values())
    .map((p, i) => ({ ...p, id: 6000000 + i }))
    .slice(0, 80);
}

function buildOsmTrailsFromOverpass(json) {
  const elements = json.elements || [];
  const byName = new Map();
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) continue;
    const built = syntheticFromOsmWay(el);
    if (!built) continue;
    const { trail, points } = built;
    const prev = byName.get(trail.name);
    if (!prev || pathLengthKm(points) > pathLengthKm(prev.points)) {
      byName.set(trail.name, { trail, points });
    }
  }
  const list = Array.from(byName.values());
  list.sort((a, b) => pathLengthKm(b.points) - pathLengthKm(a.points));
  return list.slice(0, 55);
}

function applyOsmDataset(items, centerLat, centerLng, label) {
  dataSource = 'osm';
  TRAILS = items.map((x) => x.trail);
  WAYPOINTS = {};
  items.forEach((x) => {
    WAYPOINTS[x.trail.id] = x.points;
  });
  setSearchCenter(centerLat, centerLng, label);
}

async function fetchOsmForBbox(south, west, north, east) {
  const [pathJson, peakJson] = await Promise.all([
    overpassNamedPaths(south, west, north, east),
    overpassPeaks(south, west, north, east),
  ]);
  return {
    items: buildOsmTrailsFromOverpass(pathJson),
    peaks: parsePeaksFromOverpass(peakJson),
  };
}

async function loadCsvDemo() {
  const base = 'data/';
  const [trailsT, weatherT, incT, envT, cxT, predT, wpT] = await Promise.all([
    fetch(base + 'trails.csv').then((r) => r.text()),
    fetch(base + 'weather.csv').then((r) => r.text()),
    fetch(base + 'incidents.csv').then((r) => r.text()),
    fetch(base + 'environment.csv').then((r) => r.text()),
    fetch(base + 'complexity.csv').then((r) => r.text()),
    fetch(base + 'predictions.csv').then((r) => r.text()),
    fetch(base + 'waypoints.csv').then((r) => r.text()),
  ]);
  const trails = parseCSV(trailsT);
  TRAILS = mergeTrailRows(
    trails,
    parseCSV(weatherT),
    parseCSV(incT),
    parseCSV(envT),
    parseCSV(cxT),
    parseCSV(predT)
  );
  WAYPOINTS = buildWaypoints(parseCSV(wpT));
  dataSource = 'csv';
  MOUNTAINS = [];
  setSearchCenter(47.3769, 8.5417, 'Zürich (demo CSV)');
}

async function searchPlaceAndLoadTrails() {
  const input = document.getElementById('place-search');
  const q = (input && input.value.trim()) || '';
  if (!q) return;
  const list = document.getElementById('trail-list');
  if (list) list.innerHTML = '<div class="list-status">Searching & loading OSM trails + peaks…</div>';
  try {
    const geo = await nominatimSearch(q);
    setSearchCenter(geo.lat, geo.lon, geo.displayName.split(',').slice(0, 2).join(','));
    const { items, peaks } = await fetchOsmForBbox(geo.south, geo.west, geo.north, geo.east);
    MOUNTAINS = peaks;
    if (!items.length && !peaks.length) {
      if (list) list.innerHTML = '<div class="list-status">No named paths or peaks in this area — zoom out or try “Load in map view”.</div>';
      map.setView([geo.lat, geo.lon], 12);
      refreshAfterDataLoad();
      return;
    }
    applyOsmDataset(items, geo.lat, geo.lon, searchCenter.label);
    map.setView([geo.lat, geo.lon], 12);
    refreshAfterDataLoad();
  } catch (e) {
    console.error(e);
    if (list) list.innerHTML = `<div class="list-status list-err">${String(e.message || e)}</div>`;
  }
}

async function loadTrailsNearMe() {
  const list = document.getElementById('trail-list');
  if (!navigator.geolocation) {
    if (list) list.innerHTML = '<div class="list-status list-err">Geolocation not available in this browser.</div>';
    return;
  }
  if (list) list.innerHTML = '<div class="list-status">Getting your location…</div>';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const pad = 0.05;
      try {
        setSearchCenter(lat, lng, 'Your location');
        const { items, peaks } = await fetchOsmForBbox(lat - pad, lng - pad, lat + pad, lng + pad);
        MOUNTAINS = peaks;
        if (!items.length && !peaks.length) {
          if (list) list.innerHTML = '<div class="list-status">No named paths or peaks here — pan the map and try “Load in map view”.</div>';
          map.setView([lat, lng], 13);
          refreshAfterDataLoad();
          return;
        }
        applyOsmDataset(items, lat, lng, 'Your location');
        map.setView([lat, lng], 13);
        refreshAfterDataLoad();
      } catch (e) {
        console.error(e);
        if (list) list.innerHTML = `<div class="list-status list-err">${String(e.message || e)}</div>`;
      }
    },
    () => {
      if (list) list.innerHTML = '<div class="list-status list-err">Location permission denied.</div>';
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

async function loadTrailsInMapView() {
  if (!map) return;
  const b = map.getBounds();
  const south = b.getSouth();
  const west = b.getWest();
  const north = b.getNorth();
  const east = b.getEast();
  const list = document.getElementById('trail-list');
  if (list) list.innerHTML = '<div class="list-status">Loading trails & peaks in view…</div>';
  try {
    const { items, peaks } = await fetchOsmForBbox(south, west, north, east);
    MOUNTAINS = peaks;
    const c = map.getCenter();
    if (!items.length && !peaks.length) {
      if (list) list.innerHTML = '<div class="list-status">No named paths or peaks in this view — zoom/pan and retry.</div>';
      refreshAfterDataLoad();
      return;
    }
    applyOsmDataset(items, c.lat, c.lng, 'Map view');
    refreshAfterDataLoad();
  } catch (e) {
    console.error(e);
    if (list) list.innerHTML = `<div class="list-status list-err">${String(e.message || e)}</div>`;
  }
}

async function restoreDemoCsv() {
  const list = document.getElementById('trail-list');
  if (list) list.innerHTML = '<div class="list-status">Loading demo data…</div>';
  try {
    await loadCsvDemo();
    map.setView([47.38, 8.55], 11);
    refreshAfterDataLoad();
  } catch (e) {
    console.error(e);
    if (list) list.innerHTML = '<div class="list-status list-err">Could not load CSV demo.</div>';
  }
}

const PEAK_WEATHER_STUB = {
  sky: 'Partly cloudy',
  temp: 12,
  wind: 15,
  hum: 50,
  vis: 20,
  rain: 25,
  pressure: 1015,
  updatedMin: 15,
  goodHiking: true,
};

function renderMountainMarkers() {
  if (!mountainGroup) return;
  mountainGroup.clearLayers();
  MOUNTAINS.forEach((m) => {
    const ico = L.divIcon({
      className: '',
      html: '<div class="peak-mk">▲</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker([m.lat, m.lng], { icon: ico })
      .addTo(mountainGroup)
      .on('click', () => selectMountain(m.id));
  });
}

function renderMountainList() {
  const list = document.getElementById('mountain-list');
  const cnt = document.getElementById('mountain-count');
  if (!list) return;
  if (!MOUNTAINS.length) {
    list.innerHTML =
      dataSource === 'csv'
        ? '<div class="list-status">Search a place to load OSM peaks near your search.</div>'
        : '<div class="list-status">No named peaks in this area — try a wider search or different map view.</div>';
    if (cnt) cnt.textContent = '0';
    return;
  }
  const sorted = [...MOUNTAINS].sort((a, b) => {
    const da = kmAway(searchCenter.lat, searchCenter.lng, a.lat, a.lng);
    const db = kmAway(searchCenter.lat, searchCenter.lng, b.lat, b.lng);
    return da - db;
  });
  list.innerHTML = '';
  let shown = 0;
  sorted.forEach((m) => {
    if (!m.name.toLowerCase().includes(mountainFilterQ)) return;
    shown++;
    const away = kmAway(searchCenter.lat, searchCenter.lng, m.lat, m.lng).toFixed(1);
    const div = document.createElement('div');
    div.className = 'mc-row' + (selectedMountainId === m.id ? ' active' : '');
    div.innerHTML = `
      <div class="mc-name">${escapeHtml(m.name)}</div>
      <div class="mc-meta">${away} km from search${m.ele != null ? ` · ${m.ele} m` : ''}</div>`;
    div.addEventListener('click', () => selectMountain(m.id));
    list.appendChild(div);
  });
  if (cnt) cnt.textContent = String(shown);
}

function selectMountain(id) {
  selectedMountainId = id;
  selectedId = null;
  pathGroup.clearLayers();
  const m = MOUNTAINS.find((x) => x.id === id);
  if (!m) return;
  map.setView([m.lat, m.lng], 14);
  renderMountainDetail(m);
  document.getElementById('gear').innerHTML =
    '<div class="empty"><span>🎒</span><p>Essential gear targets trail routes — select a named path in the list above</p></div>';
  renderList();
  renderMountainList();
  renderMarkers();
  renderMountainMarkers();
}

function renderMountainDetail(m) {
  const away = kmAway(searchCenter.lat, searchCenter.lng, m.lat, m.lng).toFixed(1);
  document.getElementById('detail').innerHTML = `
    <div class="dp-hd">
      <div>
        <div class="dp-title">${escapeHtml(m.name)} <span class="src-badge">Peak · OSM</span></div>
        <div class="dp-sub">${m.ele != null ? `${m.ele} m (if tagged)` : 'No elevation tag'} · ${away} km from search</div>
      </div>
      <button type="button" class="dp-close" id="dp-close-btn" aria-label="Close">✕</button>
    </div>
    <div class="metric-grid" style="grid-template-columns:1fr">
      <div class="metric-card">
        <span class="mc-lbl">About this peak</span>
        <p class="metric-desc" style="margin-top:8px;font-size:13px">Summit from OpenStreetMap (<code>natural=peak</code>). Use named trails for approach; verify conditions locally.</p>
        <p class="metric-desc" style="margin-top:10px"><strong>Coordinates</strong> ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</p>
      </div>
    </div>`;
  updateHeaderWeather(PEAK_WEATHER_STUB);
  renderConditionsPanel(PEAK_WEATHER_STUB);
  document.getElementById('dp-close-btn').addEventListener('click', closeDetail);
}

function filterMountains() {
  const inp = document.getElementById('search-mountain');
  mountainFilterQ = inp ? inp.value.toLowerCase() : '';
  renderMountainList();
}

function refreshAfterDataLoad() {
  selectedId = null;
  selectedMountainId = null;
  pathGroup.clearLayers();
  renderMarkers();
  renderMountainMarkers();
  renderList();
  renderMountainList();

  const sortedT = [...TRAILS].sort(
    (a, b) =>
      kmAway(searchCenter.lat, searchCenter.lng, a.lat, a.lng) -
      kmAway(searchCenter.lat, searchCenter.lng, b.lat, b.lng)
  );
  const sortedM = [...MOUNTAINS].sort(
    (a, b) =>
      kmAway(searchCenter.lat, searchCenter.lng, a.lat, a.lng) -
      kmAway(searchCenter.lat, searchCenter.lng, b.lat, b.lng)
  );

  const distT = sortedT[0]
    ? kmAway(searchCenter.lat, searchCenter.lng, sortedT[0].lat, sortedT[0].lng)
    : Infinity;
  const distM = sortedM[0]
    ? kmAway(searchCenter.lat, searchCenter.lng, sortedM[0].lat, sortedM[0].lng)
    : Infinity;

  if (sortedT.length && sortedM.length) {
    if (distT <= distM) {
      updateHeaderWeather(sortedT[0]);
      renderConditionsPanel(sortedT[0]);
      selectTrail(sortedT[0].id);
    } else {
      selectMountain(sortedM[0].id);
    }
  } else if (sortedT[0]) {
    updateHeaderWeather(sortedT[0]);
    renderConditionsPanel(sortedT[0]);
    selectTrail(sortedT[0].id);
  } else if (sortedM[0]) {
    selectMountain(sortedM[0].id);
  } else {
    document.getElementById('detail').innerHTML =
      '<div class="empty"><span>🗺️</span><p>No trails or peaks to show</p></div>';
    document.getElementById('gear').innerHTML =
      '<div class="empty"><span>🎒</span><p>Gear list appears here</p></div>';
  }
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([47.38, 8.55], 11);
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  markerGroup = L.layerGroup().addTo(map);
  pathGroup = L.layerGroup().addTo(map);
  mountainGroup = L.layerGroup().addTo(map);

  const leg = L.control({ position: 'bottomleft' });
  leg.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML =
      '<span class="leg s">Safe</span><span class="leg c">Caution</span><span class="leg r">Risk</span><span class="leg d">Danger</span><span class="leg p">Peak</span>';
    return d;
  };
  leg.addTo(map);
}

function renderMarkers() {
  markerGroup.clearLayers();
  TRAILS.forEach((t) => {
    const col = STATUS_COLOR[t.status] || '#94a3b8';
    const ico = L.divIcon({
      className: '',
      html: `<div class="trail-mk" style="background:${col}">${t.status[0]}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([t.lat, t.lng], { icon: ico })
      .addTo(markerGroup)
      .on('click', () => selectTrail(t.id));
  });
}

function renderPath(id) {
  pathGroup.clearLayers();
  const pts = WAYPOINTS[id];
  if (!pts || pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    L.polyline(
      [
        [pts[i][0], pts[i][1]],
        [pts[i + 1][0], pts[i + 1][1]],
      ],
      {
        color: SEG_COLOR[pts[i][2]] || '#94a3b8',
        weight: 5,
        opacity: 0.9,
      }
    ).addTo(pathGroup);
  }
  map.fitBounds(L.latLngBounds(pts.map((p) => [p[0], p[1]])), { padding: [60, 60] });
}

function updateHeaderWeather(t) {
  const el = document.getElementById('header-weather');
  if (!el || !t) return;
  const badge = t.goodHiking
    ? '<span class="hd-badge">✓ Good for hiking</span>'
    : '<span class="hd-badge hd-badge-warn">⚠ Check conditions</span>';
  el.innerHTML = `
    <span>${skyEmoji(t.sky)} <b>${t.sky}</b></span>
    <span>🌡️ <b>${Math.round(t.temp)}°C</b></span>
    <span>💨 Wind ${Math.round(t.wind)} km/h</span>
    <span>💧 Hum. ${Math.round(t.hum)}%</span>
    <span>👁️ Vis. ${t.vis} km</span>
    <span>🔽 ${Math.round(t.pressure)} hPa</span>
    ${badge}`;
}

function renderConditionsPanel(t) {
  const panel = document.getElementById('conditions-panel');
  if (!panel || !t) return;
  const badge = t.goodHiking
    ? '<span class="cond-badge ok">Good for hiking</span>'
    : '<span class="cond-badge warn">Caution — check forecast</span>';
  panel.innerHTML = `
    <div class="cond-hd">
      <span class="cond-title">Current conditions</span>
      <span class="cond-updated">Updated ${t.updatedMin} min ago</span>
    </div>
    <div class="cond-main">
      <div class="cond-temp-block">
        <span class="cond-big">${Math.round(t.temp)}°C</span>
        <div class="cond-sky">${skyEmoji(t.sky)} ${t.sky}</div>
        ${badge}
      </div>
      <div class="cond-metrics">
        <div class="cm"><span>💨</span><b>${Math.round(t.wind)}</b><small>km/h</small></div>
        <div class="cm"><span>💧</span><b>${Math.round(t.hum)}</b><small>%</small></div>
        <div class="cm"><span>👁️</span><b>${t.vis}</b><small>km</small></div>
        <div class="cm"><span>🔽</span><b>${Math.round(t.pressure)}</b><small>hPa</small></div>
      </div>
    </div>`;
  panel.hidden = false;
}

function renderList() {
  const list = document.getElementById('trail-list');
  const sorted = [...TRAILS].sort((a, b) => {
    const da = kmAway(searchCenter.lat, searchCenter.lng, a.lat, a.lng);
    const db = kmAway(searchCenter.lat, searchCenter.lng, b.lat, b.lng);
    return da - db;
  });
  list.innerHTML = '';
  let shown = 0;

  sorted.forEach((t) => {
    const s = displayRisk(t);
    const rm = riskMeta(s);
    const matchFilter = activeFilter === 'all' || t.status.toLowerCase() === activeFilter;
    const matchSearch = t.name.toLowerCase().includes(searchQ);
    if (!matchFilter || !matchSearch) return;
    shown++;

    const away = kmAway(searchCenter.lat, searchCenter.lng, t.lat, t.lng).toFixed(1);

    const div = document.createElement('div');
    div.className = 'tc' + (selectedId === t.id && selectedMountainId == null ? ' active' : '');
    div.dataset.id = t.id;
    div.innerHTML = `
      <div class="tc-thumb" aria-hidden="true">🏔️</div>
      <div class="tc-body">
        <div class="tc-hd">
          <div>
            <div class="tc-name">${escapeHtml(t.name)}</div>
            <div class="tc-meta">${away} km from search · ${t.diff} · ★ ${t.rating} · ${t.dist} km</div>
          </div>
          <span class="sbadge ${t.status.toLowerCase()}">${t.status}</span>
        </div>
        <div class="tc-ft">
          <div class="tc-bar"><div style="width:${s * 10}%;background:${rm.color}"></div></div>
          <span class="tc-score" style="color:${rm.color}">${s.toFixed(1)}</span>
        </div>
      </div>`;
    div.addEventListener('click', () => selectTrail(t.id));
    list.appendChild(div);
  });

  const cnt = document.getElementById('trail-count');
  if (cnt) cnt.textContent = `${shown} trail${shown !== 1 ? 's' : ''}`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function filterTrails() {
  const inp = document.getElementById('search');
  searchQ = inp ? inp.value.toLowerCase() : '';
  renderList();
}

function setFilter(btn) {
  document.querySelectorAll('.fb').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.f;
  renderList();
}

function selectTrail(id) {
  selectedMountainId = null;
  selectedId = id;
  const t = TRAILS.find((x) => x.id === id);
  if (!t) return;
  renderPath(id);
  renderDetail(t);
  renderGear(t);
  renderList();
  renderMountainList();
  updateHeaderWeather(t);
  renderConditionsPanel(t);
}

function closeDetail() {
  selectedId = null;
  selectedMountainId = null;
  pathGroup.clearLayers();
  document.getElementById('detail').innerHTML =
    '<div class="empty"><span>🗺️</span><p>Select a trail or peak for details</p></div>';
  document.getElementById('gear').innerHTML =
    '<div class="empty"><span>🎒</span><p>Gear list appears here</p></div>';
  map.setView([searchCenter.lat, searchCenter.lng], 11);
  const sorted = [...TRAILS].sort(
    (a, b) =>
      kmAway(searchCenter.lat, searchCenter.lng, a.lat, a.lng) -
      kmAway(searchCenter.lat, searchCenter.lng, b.lat, b.lng)
  );
  const first = sorted[0];
  if (first) {
    updateHeaderWeather(first);
    renderConditionsPanel(first);
  }
  renderList();
  renderMountainList();
}

function diffIndex(d) {
  const o = { Easy: 0, Moderate: 1, Hard: 2, Expert: 3 };
  return o[d] !== undefined ? o[d] : 1;
}

function renderDetail(t) {
  const s = displayRisk(t);
  const h = riskScoreHeuristic(t);
  const rm = riskMeta(s);
  const tempOk = t.temp >= 10 && t.temp <= 25;
  const elevTag =
    t.elev > 800 ? ['Strenuous', 'xhigh'] : t.elev > 400 ? ['Moderate', 'mod'] : ['Gentle', 'low'];
  const diffTag = {
    Easy: ['Beginner', 'low'],
    Moderate: ['Intermediate', 'mod'],
    Hard: ['Advanced', 'high'],
    Expert: ['Expert', 'xhigh'],
  }[t.diff] || ['—', 'mod'];
  const techBar = Math.min(100, (t.technical / 10) * 100);
  const diffBar = (diffIndex(t.diff) / 3) * 100;
  const src = t.source === 'osm' ? '<span class="src-badge">OpenStreetMap</span>' : '';

  document.getElementById('detail').innerHTML = `
    <div class="dp-hd">
      <div>
        <div class="dp-title">${escapeHtml(t.name)} ${src}</div>
        <div class="dp-sub">${t.type} · ${t.surf} · ★ ${t.rating}</div>
      </div>
      <button type="button" class="dp-close" id="dp-close-btn" aria-label="Close">✕</button>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-hd">
          <span class="mc-lbl">Temperature</span>
          <span class="mc-tag ${tempOk ? 'low' : 'mod'}">${tempOk ? 'Ideal' : 'Check'}</span>
        </div>
        <div class="metric-val">${Math.round(t.temp)}°C</div>
        <div class="metric-bar"><div style="width:${Math.min(100, (t.temp / 35) * 100)}%"></div></div>
        <p class="metric-desc">Comfortable hiking temperature range</p>
      </div>
      <div class="metric-card">
        <div class="metric-card-hd">
          <span class="mc-lbl">Elevation gain</span>
          <span class="mc-tag ${elevTag[1]}">${elevTag[0]}</span>
        </div>
        <div class="metric-val">${Math.round(t.elev)} m</div>
        <div class="metric-bar warn"><div style="width:${Math.min(100, t.elev / 15)}%"></div></div>
        <p class="metric-desc">${escapeHtml(t.complexityNote || 'Mind slope and distance.')}</p>
      </div>
      <div class="metric-card">
        <div class="metric-card-hd">
          <span class="mc-lbl">Trail difficulty</span>
          <span class="mc-tag ${diffTag[1]}">${diffTag[0]}</span>
        </div>
        <div class="metric-val">${t.diff}</div>
        <div class="metric-bar danger"><div style="width:${diffBar}%"></div></div>
        <p class="metric-desc">${t.inc} incident${t.inc !== 1 ? 's' : ''} last year · ${t.rockiness} surface</p>
      </div>
    </div>

    <div class="env-strip">
      <span>🌲 Canopy ~${t.canopy}%</span>
      <span>⛰️ Exposure: ${t.exposure}</span>
      <span>🧱 Soil: ${t.soil}</span>
      ${t.avalanche !== 'none' ? `<span>❄️ Avalanche: ${t.avalanche}</span>` : ''}
    </div>

    <div class="rsc">
      <div class="rsc-l">
        <div class="rsc-title">Trail risk (prediction)</div>
        <div class="donut-wrap">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle class="donut-track" cx="60" cy="60" r="44" fill="none" stroke="#e7e5e4" stroke-width="12"/>
            <circle class="donut-fill" cx="60" cy="60" r="44" fill="none" stroke="${rm.color}" stroke-width="12"
              stroke-dasharray="${2 * Math.PI * 44}" stroke-dashoffset="${2 * Math.PI * 44 * (1 - s / 10)}"
              transform="rotate(-90 60 60)" stroke-linecap="round"/>
            <text x="60" y="58" text-anchor="middle" class="donut-num" fill="${rm.color}">${s.toFixed(1)}</text>
            <text x="60" y="76" text-anchor="middle" class="donut-sub">out of 10</text>
          </svg>
        </div>
        <p class="pred-foot">
          ${t.predictionNote ? `<span class="pred-note">${escapeHtml(t.predictionNote)}</span>` : ''}
          ${t.predictionConf !== null && !Number.isNaN(t.predictionConf) ? `<span class="pred-conf">Confidence ~${Math.round(t.predictionConf * 100)}%</span>` : ''}
        </p>
        <p class="pred-alt">Rule-based (comparison): <strong>${h.toFixed(1)}</strong></p>
      </div>
      <div class="rsc-r">
        <div class="rf"><span>Slope</span><div class="rf-bar"><div style="width:${techBar}%;background:#818cf8"></div></div></div>
        <div class="rf"><span>Weather</span><div class="rf-bar"><div style="width:${t.rain}%;background:#38bdf8"></div></div></div>
        <div class="rf"><span>Terrain</span><div class="rf-bar"><div style="width:${diffBar}%;background:#fb923c"></div></div></div>
        <div class="rf"><span>History</span><div class="rf-bar"><div style="width:${Math.min(100, t.inc * 12)}%;background:#f43f5e"></div></div></div>
        <div class="verdict" style="background:${rm.color}22;border:1px solid ${rm.color}44">
          <span style="color:${rm.color}">⚠ ${rm.label} — ${t.status}</span>
        </div>
      </div>
    </div>`;

  document.getElementById('dp-close-btn').addEventListener('click', closeDetail);
}

function buildGear(t) {
  const gear = [];
  if (['Hard', 'Expert'].includes(t.diff))
    gear.push({
      id: 'boots',
      ico: '🥾',
      name: 'Waterproof hiking boots',
      pri: 'CRITICAL',
      reason: `Mud/wet possible; ${t.surf} surface. Ankle support matters.`,
    });
  if (t.elev > 400)
    gear.push({
      id: 'poles',
      ico: '🪄',
      name: 'Trekking poles',
      pri: t.elev > 800 ? 'HIGH' : 'MEDIUM',
      reason: `${Math.round(t.elev)} m gain — reduces knee strain.`,
    });
  if (t.water === 0 || t.dist > 6)
    gear.push({
      id: 'water',
      ico: '💧',
      name: 'Extra water (3 L min)',
      pri: 'CRITICAL',
      reason:
        t.water === 0 ? 'No reliable water on route.' : 'Long route — carry enough to drink.',
    });
  if (t.rain > 25)
    gear.push({
      id: 'jacket',
      ico: '🧥',
      name: 'Rain jacket',
      pri: t.rain > 50 ? 'CRITICAL' : 'HIGH',
      reason: `${Math.round(t.rain)}% chance of precipitation.`,
    });
  if (t.temp < 16)
    gear.push({
      id: 'layers',
      ico: '🧣',
      name: 'Insulation / layers',
      pri: 'HIGH',
      reason: `~${Math.round(t.temp)}°C — cools quickly at altitude.`,
    });
  if (t.dist > 8 || ['Hard', 'Expert'].includes(t.diff))
    gear.push({
      id: 'firstaid',
      ico: '🩺',
      name: 'First aid kit',
      pri: 'HIGH',
      reason: 'Long or technical route — carry basic care items.',
    });
  if (['Expert', 'Hard'].includes(t.diff))
    gear.push({
      id: 'nav',
      ico: '🧭',
      name: 'Navigation (GPS / map)',
      pri: 'HIGH',
      reason: 'Complex terrain — do not rely on signs alone.',
    });
  gear.push({
    id: 'sun',
    ico: '🕶️',
    name: 'Sun protection',
    pri: 'MEDIUM',
    reason: 'SPF 30+ and sunglasses recommended.',
  });
  return gear;
}

function renderGear(t) {
  const gear = buildGear(t);
  const stored = JSON.parse(localStorage.getItem('gear_' + t.id) || '{}');
  const ready = gear.filter((g) => stored[g.id]).length;
  const priCls = { CRITICAL: 'crit', HIGH: 'high', MEDIUM: 'med' };
  const giCls = { CRITICAL: 'crit', HIGH: 'high', MEDIUM: '' };

  document.getElementById('gear').innerHTML = `
    <div class="gear-hd">
      <span class="gear-title">Essential gear</span>
      <span class="gear-prog-lbl">${ready}/${gear.length} ready</span>
    </div>
    <div class="gear-prog-bar"><div style="width:${gear.length ? (ready / gear.length) * 100 : 0}%"></div></div>
    <div class="gear-list">
      ${gear
        .map(
          (g) => `
        <div class="gi ${giCls[g.pri] || ''}">
          <div class="gi-ico">${g.ico}</div>
          <div class="gi-body">
            <div class="gi-top">
              <span class="gi-name">${escapeHtml(g.name)}</span>
              <span class="gi-badge ${priCls[g.pri] || 'med'}">${g.pri}</span>
            </div>
            <div class="gi-reason">${escapeHtml(g.reason)}</div>
            <label class="gi-chk">
              <input type="checkbox" data-tid="${t.id}" data-gid="${g.id}" ${stored[g.id] ? 'checked' : ''}/>
              <span>I have this</span>
            </label>
          </div>
        </div>`
        )
        .join('')}
    </div>`;

  document.getElementById('gear').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      toggleGear(cb.dataset.tid, cb.dataset.gid, cb.checked);
    });
  });
}

function toggleGear(tid, gid, val) {
  const k = 'gear_' + tid;
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s[gid] = val;
  localStorage.setItem(k, JSON.stringify(s));
  const t = TRAILS.find((x) => String(x.id) === String(tid));
  if (t) renderGear(t);
}

// When this script is injected after /api/auth/me (index-boot.js), DOMContentLoaded has
// already fired — register both paths so the map and CSV load in every case.
async function bootApp() {
  initMap();
  try {
    await loadCsvDemo();
  } catch (e) {
    console.error(e);
    document.getElementById('detail').innerHTML =
      '<div class="empty"><p>Could not load data. Open via a local server (not file://).</p></div>';
    return;
  }

  renderMarkers();
  renderMountainMarkers();
  renderList();
  renderMountainList();
  const first = TRAILS[0];
  if (first) {
    updateHeaderWeather(first);
    renderConditionsPanel(first);
    setTimeout(() => selectTrail(first.id), 400);
  }

  const ps = document.getElementById('place-search');
  if (ps) {
    ps.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        searchPlaceAndLoadTrails();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void bootApp();
  });
} else {
  void bootApp();
}

window.filterTrails = filterTrails;
window.setFilter = setFilter;
window.closeDetail = closeDetail;
window.searchPlaceAndLoadTrails = searchPlaceAndLoadTrails;
window.loadTrailsNearMe = loadTrailsNearMe;
window.loadTrailsInMapView = loadTrailsInMapView;
window.restoreDemoCsv = restoreDemoCsv;
window.filterMountains = filterMountains;
