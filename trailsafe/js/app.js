// ============================================================
// TrailSafe — Main Application Logic
// ============================================================

let map, trails = [], waypoints = [], selectedTrail = null;
let markerLayer, pathLayer;

// ------ CSV Parser ------
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => {
      const n = parseFloat(vals[i]);
      obj[h] = isNaN(n) ? vals[i] : n;
    });
    return obj;
  });
}

// ------ Risk Score Engine ------
function computeRiskScore(trail, weather = null) {
  // Weighted feature scoring (0–10 scale)
  const w = {
    difficulty: 0.25,
    elevation: 0.20,
    incidents: 0.20,
    weather: 0.20,
    visibility: 0.15
  };

  const diffMap = { Easy: 2, Moderate: 5, Hard: 7.5, Expert: 9.5 };
  const diffScore = diffMap[trail.difficulty] || 5;

  const elevScore = Math.min(10, (trail.elevation_gain_m / 150));

  const incidentScore = Math.min(10, trail.incidents_last_year * 1.2);

  const precipScore = (trail.precipitation_chance / 100) * 10;
  const humidScore = (trail.humidity_pct / 100) * 5;
  const windScore = Math.min(10, trail.wind_kmh / 4);
  const weatherScore = (precipScore * 0.5 + humidScore * 0.25 + windScore * 0.25);

  const visScore = Math.max(0, 10 - trail.visibility_km * 0.4);

  const raw = (
    diffScore * w.difficulty +
    elevScore * w.elevation +
    incidentScore * w.incidents +
    weatherScore * w.weather +
    visScore * w.visibility
  );

  return Math.min(10, Math.max(1, parseFloat(raw.toFixed(1))));
}

function riskLabel(score) {
  if (score <= 3) return { label: 'Low', color: '#22c55e', cls: 'safe' };
  if (score <= 5.5) return { label: 'Moderate', color: '#f59e0b', cls: 'caution' };
  if (score <= 7.5) return { label: 'High', color: '#f97316', cls: 'risk' };
  return { label: 'Extreme', color: '#ef4444', cls: 'danger' };
}

function statusColor(status) {
  const map = { Safe: '#22c55e', Caution: '#f59e0b', Risk: '#f97316', Danger: '#ef4444' };
  return map[status] || '#94a3b8';
}

// ------ Gear Checklist Generator ------
function buildGearList(trail) {
  const gear = [];
  const score = computeRiskScore(trail);

  if (['Hard', 'Expert'].includes(trail.difficulty))
    gear.push({ id: 'boots', icon: '🥾', name: 'Waterproof Hiking Boots', priority: 'CRITICAL', reason: 'Rocky terrain and possible mud. Ankle support essential.' });

  if (trail.elevation_gain_m > 400)
    gear.push({ id: 'poles', icon: '🪄', name: 'Trekking Poles', priority: trail.elevation_gain_m > 800 ? 'HIGH' : 'MEDIUM', reason: `${trail.elevation_gain_m}m gain — poles reduce knee strain on descent.` });

  if (trail.water_sources === 0 || trail.distance_km > 6)
    gear.push({ id: 'water', icon: '💧', name: 'Extra Water (3L min)', priority: 'CRITICAL', reason: `${trail.water_sources === 0 ? 'No water sources on trail.' : 'Long trail.'} Bring 3L+.` });

  if (trail.precipitation_chance > 25)
    gear.push({ id: 'jacket', icon: '🧥', name: 'Rain Jacket', priority: trail.precipitation_chance > 50 ? 'CRITICAL' : 'HIGH', reason: `${trail.precipitation_chance}% rain chance after 2PM. Pack waterproof layer.` });

  if (trail.avg_temp_c < 16)
    gear.push({ id: 'layers', icon: '🧣', name: 'Insulation Layers', priority: 'HIGH', reason: `Avg ${trail.avg_temp_c}°C — temperature drops fast at elevation.` });

  if (trail.distance_km > 8 || ['Hard', 'Expert'].includes(trail.difficulty))
    gear.push({ id: 'firstaid', icon: '🩺', name: 'First Aid Kit', priority: 'HIGH', reason: 'Long or technical trail. Carry basic wound care.' });

  if (['Expert', 'Hard'].includes(trail.difficulty))
    gear.push({ id: 'nav', icon: '🧭', name: 'Navigation Device / Map', priority: 'HIGH', reason: 'Complex terrain — GPS or printed map recommended.' });

  gear.push({ id: 'sun', icon: '🕶️', name: 'Sun Protection', priority: 'MEDIUM', reason: 'SPF 30+ sunscreen and UV sunglasses advised.' });

  return gear;
}

// ------ Map Init ------
function initMap() {
  map = L.map('trail-map', { zoomControl: false }).setView([47.38, 8.55], 11);

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenTopoMap contributors'
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  pathLayer = L.layerGroup().addTo(map);

  // Custom legend
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
      <span class="leg-item safe-dot">Safe</span>
      <span class="leg-item caution-dot">Caution</span>
      <span class="leg-item risk-dot">Risk</span>
      <span class="leg-item danger-dot">Danger</span>
    `;
    return div;
  };
  legend.addTo(map);
}

// ------ Render Markers ------
function renderMarkers() {
  markerLayer.clearLayers();
  trails.forEach(trail => {
    const score = computeRiskScore(trail);
    const risk = riskLabel(score);
    const color = statusColor(trail.status);

    const icon = L.divIcon({
      className: '',
      html: `<div class="trail-marker" style="background:${color}" title="${trail.name}">
               <span>${trail.status[0]}</span>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([trail.lat, trail.lng], { icon })
      .addTo(markerLayer)
      .on('click', () => selectTrail(trail));
  });
}

// ------ Render Trail Path ------
function renderTrailPath(trailId) {
  pathLayer.clearLayers();
  const pts = waypoints.filter(w => w.trail_id === trailId);
  if (pts.length < 2) return;

  const segColors = { safe: '#22c55e', caution: '#f59e0b', risk: '#f97316', danger: '#ef4444' };

  for (let i = 0; i < pts.length - 1; i++) {
    const color = segColors[pts[i].segment_status] || '#94a3b8';
    L.polyline([[pts[i].lat, pts[i].lng], [pts[i+1].lat, pts[i+1].lng]], {
      color, weight: 5, opacity: 0.9
    }).addTo(pathLayer);
  }

  const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [60, 60] });
}

// ------ Select Trail ------
function selectTrail(trail) {
  selectedTrail = trail;
  renderTrailPath(trail.id);
  renderDetailPanel(trail);
  renderGearPanel(trail);

  // Highlight selected in sidebar list
  document.querySelectorAll('.trail-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.trail-card[data-id="${trail.id}"]`);
  if (card) { card.classList.add('selected'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ------ Render Trail Cards Sidebar ------
function renderTrailList() {
  const container = document.getElementById('trail-list');
  container.innerHTML = '';

  const sorted = [...trails].sort((a, b) => computeRiskScore(b) - computeRiskScore(a));

  sorted.forEach(trail => {
    const score = computeRiskScore(trail);
    const risk = riskLabel(score);
    const card = document.createElement('div');
    card.className = 'trail-card';
    card.dataset.id = trail.id;
    card.innerHTML = `
      <div class="tc-header">
        <div>
          <div class="tc-name">${trail.name}</div>
          <div class="tc-meta">${trail.distance_km} km · ${trail.difficulty}</div>
        </div>
        <span class="status-badge ${trail.status.toLowerCase()}">${trail.status}</span>
      </div>
      <div class="tc-footer">
        <span class="tc-rating">★ ${trail.rating}</span>
        <div class="tc-risk-bar">
          <div class="tc-risk-fill" style="width:${score*10}%; background:${risk.color}"></div>
        </div>
        <span class="tc-score" style="color:${risk.color}">${score}</span>
      </div>
    `;
    card.addEventListener('click', () => selectTrail(trail));
    container.appendChild(card);
  });
}

// ------ Render Detail Panel ------
function renderDetailPanel(trail) {
  const score = computeRiskScore(trail);
  const risk = riskLabel(score);
  const panel = document.getElementById('detail-panel');

  const tempClass = trail.avg_temp_c >= 10 && trail.avg_temp_c <= 25 ? 'ideal' : 'warning';

  panel.innerHTML = `
    <div class="dp-header">
      <div>
        <h2 class="dp-title">${trail.name}</h2>
        <div class="dp-sub">${trail.trail_type} · ${trail.surface}</div>
      </div>
      <button class="dp-close" onclick="closeDetail()">✕</button>
    </div>

    <div class="weather-strip">
      <div class="ws-temp">
        <span class="ws-big">${trail.avg_temp_c}°C</span>
        <span class="ws-badge ${tempClass}">${tempClass === 'ideal' ? 'Ideal' : 'Check'}</span>
      </div>
      <div class="ws-bar-wrap">
        <div class="ws-bar"><div style="width:${Math.min(100,(trail.avg_temp_c/35)*100)}%; background:var(--green)"></div></div>
        <span class="ws-label">Comfortable hiking temperature</span>
      </div>
      <div class="ws-stats">
        <div class="ws-stat"><span class="ws-icon">💨</span><b>${trail.wind_kmh}</b><small>km/h</small></div>
        <div class="ws-stat"><span class="ws-icon">💧</span><b>${trail.humidity_pct}</b><small>%</small></div>
        <div class="ws-stat"><span class="ws-icon">👁️</span><b>${trail.visibility_km}</b><small>km</small></div>
        <div class="ws-stat"><span class="ws-icon">☔</span><b>${trail.precipitation_chance}</b><small>%</small></div>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="mc-icon alt-icon">⛰️</div>
        <div class="mc-body">
          <div class="mc-label">Altitude Gain</div>
          <div class="mc-value">${trail.elevation_gain_m} m</div>
          <span class="mc-badge ${trail.elevation_gain_m > 800 ? 'hard' : trail.elevation_gain_m > 400 ? 'moderate' : 'easy'}">
            ${trail.elevation_gain_m > 800 ? 'Strenuous' : trail.elevation_gain_m > 400 ? 'Moderate' : 'Gentle'}
          </span>
          <div class="mc-desc">Cumulative elevation over ${trail.distance_km} km</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="mc-icon diff-icon">🧗</div>
        <div class="mc-body">
          <div class="mc-label">Trail Difficulty</div>
          <div class="mc-value">${trail.difficulty}</div>
          <span class="mc-badge ${trail.difficulty.toLowerCase()}">${trail.difficulty === 'Easy' ? 'Beginner' : trail.difficulty === 'Moderate' ? 'Intermediate' : trail.difficulty === 'Hard' ? 'Advanced' : 'Expert Only'}</span>
          <div class="mc-desc">${trail.incidents_last_year} incidents last year</div>
        </div>
      </div>
    </div>

    <div class="risk-score-card">
      <div class="rsc-left">
        <div class="rsc-title">Trail Risk Score</div>
        <div class="rsc-gauge" id="gauge-container">
          <svg viewBox="0 0 120 70" class="gauge-svg">
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#e2e8f0" stroke-width="10" stroke-linecap="round"/>
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="url(#gGrad)" stroke-width="10" stroke-linecap="round"
                  stroke-dasharray="157" stroke-dashoffset="${157 - (score/10)*157}" style="transition:stroke-dashoffset 1s ease"/>
            <defs>
              <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#22c55e"/>
                <stop offset="50%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#ef4444"/>
              </linearGradient>
            </defs>
            <text x="60" y="58" text-anchor="middle" class="gauge-num" style="fill:${risk.color}">${score}</text>
            <text x="60" y="68" text-anchor="middle" class="gauge-sub">out of 10</text>
          </svg>
        </div>
      </div>
      <div class="rsc-right">
        <div class="risk-factor" data-score="${(trail.elevation_gain_m/150).toFixed(1)}">
          <span>Elevation</span><div class="rf-bar"><div style="width:${Math.min(100,(trail.elevation_gain_m/15))}%;background:#818cf8"></div></div>
        </div>
        <div class="risk-factor">
          <span>Weather</span><div class="rf-bar"><div style="width:${trail.precipitation_chance}%;background:#38bdf8"></div></div>
        </div>
        <div class="risk-factor">
          <span>Terrain</span><div class="rf-bar"><div style="width:${['Easy','Moderate','Hard','Expert'].indexOf(trail.difficulty)/3*100}%;background:#fb923c"></div></div>
        </div>
        <div class="risk-factor">
          <span>History</span><div class="rf-bar"><div style="width:${Math.min(100,trail.incidents_last_year*12)}%;background:#f43f5e"></div></div>
        </div>
        <div class="rsc-verdict" style="background:${risk.color}22;border:1px solid ${risk.color}44">
          <span style="color:${risk.color}">⚠ ${risk.label} Risk</span>
        </div>
      </div>
    </div>
  `;
}

// ------ Render Gear Panel ------
function renderGearPanel(trail) {
  const gear = buildGearList(trail);
  const panel = document.getElementById('gear-panel');
  const checked = JSON.parse(localStorage.getItem('gear_' + trail.id) || '{}');
  const readyCount = gear.filter(g => checked[g.id]).length;

  panel.innerHTML = `
    <div class="gear-header">
      <span class="gear-title">Essential Gear</span>
      <span class="gear-progress">${readyCount}/${gear.length} Ready</span>
    </div>
    <div class="gear-progress-bar">
      <div style="width:${(readyCount/gear.length)*100}%;background:var(--green);transition:width 0.4s"></div>
    </div>
    <div class="gear-list" id="gear-list">
      ${gear.map(g => `
        <div class="gear-item priority-${g.priority.toLowerCase()}" data-id="${g.id}">
          <div class="gi-icon">${g.icon}</div>
          <div class="gi-body">
            <div class="gi-top">
              <span class="gi-name">${g.name}</span>
              <span class="gi-badge ${g.priority.toLowerCase()}">${g.priority}</span>
            </div>
            <div class="gi-reason">${g.reason}</div>
            <label class="gi-check">
              <input type="checkbox" ${checked[g.id] ? 'checked' : ''} onchange="toggleGear('${trail.id}','${g.id}',this.checked)">
              <span>I have this</span>
            </label>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function toggleGear(trailId, gearId, val) {
  const key = 'gear_' + trailId;
  const checked = JSON.parse(localStorage.getItem(key) || '{}');
  checked[gearId] = val;
  localStorage.setItem(key, JSON.stringify(checked));
  // re-render progress
  if (selectedTrail && selectedTrail.id == trailId) renderGearPanel(selectedTrail);
}

function closeDetail() {
  selectedTrail = null;
  pathLayer.clearLayers();
  document.getElementById('detail-panel').innerHTML = `<div class="empty-detail"><span>🗺️</span><p>Select a trail to view details</p></div>`;
  document.getElementById('gear-panel').innerHTML = `<div class="empty-detail"><span>🎒</span><p>Gear list appears here</p></div>`;
  document.querySelectorAll('.trail-card').forEach(c => c.classList.remove('selected'));
  map.setView([47.38, 8.55], 11);
}

// ------ Weather Bar (top strip) ------
function renderWeatherStrip() {
  const now = new Date();
  const strip = document.getElementById('weather-strip-global');
  strip.innerHTML = `
    <div class="wsg-item">🌤️ <b>Partly Cloudy</b></div>
    <div class="wsg-item">🌡️ <b>22°C</b></div>
    <div class="wsg-item">💨 Wind 13 km/h</div>
    <div class="wsg-item">💧 Humidity 45%</div>
    <div class="wsg-item">👁️ Visibility 16 km</div>
    <div class="wsg-item">⏱️ Updated just now</div>
  `;
}

// ------ Search ------
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.trail-card').forEach(card => {
      const name = card.querySelector('.tc-name').textContent.toLowerCase();
      card.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

// ------ Filter ------
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.querySelectorAll('.trail-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        const trail = trails.find(t => t.id === id);
        if (!trail) return;
        if (filter === 'all') card.style.display = '';
        else card.style.display = trail.status.toLowerCase() === filter ? '' : 'none';
      });
    });
  });
}

// ------ Init ------
async function init() {
  const [trailsCSV, waypointsCSV] = await Promise.all([
    fetch('./data/trails.csv').then(r => r.text()),
    fetch('./data/waypoints.csv').then(r => r.text())
  ]);

  trails = parseCSV(trailsCSV);
  waypoints = parseCSV(waypointsCSV);

  initMap();
  renderMarkers();
  renderTrailList();
  renderWeatherStrip();
  setupSearch();
  setupFilters();

  // Auto-select first trail
  setTimeout(() => selectTrail(trails[0]), 500);
}

document.addEventListener('DOMContentLoaded', init);
