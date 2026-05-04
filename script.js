const API      = 'http://127.0.0.1:5000';
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const MAX_BUDGET = 10000;
const PARTS    = ['Electric Motor','Battery','Air Filter','Propeller','Solar Panel'];
const MEDALS   = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

let map, minimap, mapsReady = false;
const st = {
  sessionId: null, playerName: '',
  curLat: 0, curLng: 0, curName: '',
  currentMarker: null, visitedMarkers: [], optionMarkers: [],
  flightLines: [], minimapLines: [], minimapDot: null,
};

//MAPS

function initMaps() {
  if (mapsReady) return;
  mapsReady = true;
  map = L.map('map', { center:[30,10], zoom:2, zoomControl:false, attributionControl:false });
  L.tileLayer(TILE_URL, { maxZoom:18 }).addTo(map);
  L.control.zoom({ position:'topright' }).addTo(map);
  minimap = L.map('minimap', {
    center:[30,10], zoom:1, zoomControl:false, attributionControl:false,
    dragging:false, touchZoom:false, scrollWheelZoom:false, doubleClickZoom:false, keyboard:false,
  });
  L.tileLayer(TILE_URL, { maxZoom:6 }).addTo(minimap);
}

function icon(cls) {

  let content = '';

//  PLAYER
  if (cls === 'marker-current') {
    content = `<span style="font-size:40px;">\u{1F977}\u{1F3FB}</span>`;
  }

  //  OPTION LOCATIONS
  else if (cls === 'marker-option') {
    content = `<div style="
      width:12px;
      height:12px;
      background:#2563eb;
      border-radius:50%;
    "></div>`;
  }

  //  VISITED LOCATIONS
  else if (cls === 'marker-visited') {
    content = `<div style="
      width:10px;
      height:10px;
      background:#16a34a;
      border-radius:50%;
    "></div>`;
  }

  return L.divIcon({
    className: '',
    html: `<div style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:50px;
      height:50px;
    ">${content}</div>`,
    iconSize: [30, 30],
    iconAnchor: [20, 20]
  });
}
function clearOptions() {
  st.optionMarkers.forEach(m => map.removeLayer(m));
  st.optionMarkers = [];
}

function placeCurrentMarker(lat, lng, name) {
  if (st.currentMarker) map.removeLayer(st.currentMarker);
  st.currentMarker = L.marker([lat,lng], { icon:icon('marker-current') })
    .bindTooltip('\u{1F6A9}'+name, { direction:'top' }).addTo(map);
}

function updateMinimap(lat, lng) {
  if (st.minimapDot) minimap.removeLayer(st.minimapDot);
  st.minimapDot = L.circleMarker([lat,lng], { radius:5, color:'#16a34a', fillColor:'#16a34a', fillOpacity:1 }).addTo(minimap);
  minimap.setView([lat,lng], minimap.getZoom());
}

function drawLine(fromLat, fromLng, toLat, toLng) {
  const opts = { color:'rgba(37,99,235,0.55)', weight:2, dashArray:'6,4' };
  st.flightLines.push(L.polyline([[fromLat,fromLng],[toLat,toLng]], opts).addTo(map));
  st.minimapLines.push(L.polyline([[fromLat,fromLng],[toLat,toLng]], { color:'rgba(37,99,235,0.4)', weight:1.5 }).addTo(minimap));
}

//SCREENS
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
  const el = document.getElementById(id);
  el.style.display = 'flex'; el.classList.add('active');
}


//HUD
function updateHUD(gs) {
  document.getElementById('playerNameDisplay').textContent = gs.player;
  document.getElementById('turnDisplay').textContent       = gs.visited_airports.length;
  document.getElementById('budgetDisplay').textContent     = Math.max(0, Math.round(gs.budget));
  document.getElementById('scoreDisplay').textContent      = gs.collected_parts.length * 20;
  document.getElementById('partsDisplay').textContent      = gs.collected_parts.length;


  const pct = Math.max(0, gs.budget / MAX_BUDGET * 100);
  const bar = document.getElementById('co2Bar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 50 ? 'linear-gradient(90deg,#16a34a,#2563eb)'
    : pct > 20 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#dc2626,#f87171)';

  const grid = document.getElementById('partsGrid');
  grid.innerHTML = '';
  PARTS.forEach(p => {
    const d = document.createElement('div');
    d.className = 'part-chip' + (gs.collected_parts.includes(p) ? ' collected' : '');
    d.textContent = gs.collected_parts.includes(p) ? '✓ '+p : p;
    grid.appendChild(d);
  });
}


//WEATHER
function showWeather(weather, visitedCount) {
  if (!weather) return;
  document.getElementById('weatherDisplay').textContent = weather.icon + ' ' + weather.description + ' · ' + weather.temp + '°C';
  const eff = document.getElementById('weatherEffect');

  if (visitedCount === 0) {
    eff.textContent = '';
    eff.className = 'weather-effect';
    return;
  }
  if (weather.co2_effect > 0) {
    eff.textContent = '\u2600 Perfect conditions: +' + weather.co2_effect + ' CO₂ bonus';
    eff.className = 'weather-effect bonus';
  } else if (weather.co2_effect < 0) {
    const severity = weather.co2_effect < -800 ? 'bad' : 'penalty';
    eff.textContent = '\u26A0 Weather penalty: ' + weather.co2_effect + ' CO₂';
    eff.className = 'weather-effect ' + severity;
  } else {
    eff.textContent = 'No weather effect';
    eff.className = 'weather-effect';
  }
}


//MESSAGES
function showMessage(text, type) {
  const box = document.getElementById('messageBox');
  box.textContent = text;
  box.className = 'message-box' + (type === 'error' ? ' error' : '');
  clearTimeout(box._t);
  box._t = setTimeout(() => { box.className = 'message-box hidden'; }, 5000);
}


//DESTINATIONS
function calcDist(lat1, lng1, lat2, lng2) {
  const R = 6371, r = Math.PI/180;
  const dLat = (lat2-lat1)*r, dLng = (lng2-lng1)*r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function buildDestinations(destinations, curLat, curLng) {
  const panel = document.getElementById('destinationsPanel');
  panel.innerHTML = '';
  clearOptions();

  if (!destinations || destinations.length === 0) {
    panel.innerHTML = '<p class="hint">No reachable airports — budget too low!</p>';
    return;
  }


  destinations.forEach(dest => {

    const cost = dest.cost;
    const dist = calcDist(curLat, curLng, dest.latitude_deg, dest.longitude_deg);

    const m = L.marker([dest.latitude_deg, dest.longitude_deg], { icon:icon('marker-option') })
      .bindTooltip('\u{2708} ' + dest.name + ' | CO\u2082: ' + cost, { direction: 'top' }).addTo(map);
    m.on('click', () => travelTo(dest, cost, curLat, curLng));
    st.optionMarkers.push(m);

    const btn = document.createElement('button');
    btn.className = 'dest-btn';
    btn.innerHTML = `<span class="dest-name">\u2708 ${dest.name}</span>
      <div class="dest-meta"><span>${dest.iso_country} · ${dist.toFixed(0)} km</span>
      <span class="dest-cost">CO₂ −${cost}</span></div>`;
    btn.onclick = () => travelTo(dest, cost, curLat, curLng);
    panel.appendChild(btn);
  });
}

//TRAVEL
async function travelTo(dest, cost, fromLat, fromLng) {
  try {
    const res = await fetch(API + '/move-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: st.sessionId,
        location: dest.ident,
        cost: cost
      })
    });

    //  IMPORTANT CHECK
    if (!res.ok) {
      showMessage('Move failed (server error)', 'error');
      return;
    }

    const data = await res.json();

    if (data.status !== 'success') {
      showMessage(data.message || 'Move failed', 'error');
      return;
    }

    //  SUCCESS
    drawLine(fromLat, fromLng, dest.latitude_deg, dest.longitude_deg);

    L.marker([fromLat, fromLng], { icon: icon('marker-visited') })
      .bindTooltip(st.curName)
      .addTo(map);

    st.visitedMarkers.push(st.currentMarker);

    map.flyTo(
      [dest.latitude_deg, dest.longitude_deg],
      Math.max(map.getZoom(), 4),
      { duration: 1.2 }
    );

    await loadStatus();

  } catch (e) {
    showMessage('Connection error: ' + e.message, 'error');
  }
}

//STATUS
async function loadStatus() {
  try {
    const res  = await fetch(API+'/status/'+st.sessionId);
    const data = await res.json();
    if (data.status === 'error') { showMessage('Session error — restart.','error'); return; }

    const { game_state:gs, current_location_data:loc, destinations, message, weather, is_completed, is_lost, loss_reason } = data;

    updateHUD(gs);
    st.curLat = parseFloat(loc.latitude_deg);
    st.curLng = parseFloat(loc.longitude_deg);
    st.curName = loc.name;

    document.getElementById('locationName').textContent    = loc.name;
    document.getElementById('locationCountry').textContent = 'Country: '+loc.iso_country;
    document.getElementById('locationCoords').textContent  = st.curLat.toFixed(4)+'°, '+st.curLng.toFixed(4)+'°';

    placeCurrentMarker(st.curLat, st.curLng, loc.name);
    updateMinimap(st.curLat, st.curLng);
    buildDestinations(destinations, st.curLat, st.curLng);
    showWeather(weather, data.visited_count);

    if (message) {

  // DEBUG
  console.log("MESSAGE:", message);

  if (message.toLowerCase().includes("got")) {
    showCelebration();
  }

  showMessage('\u{1F6E0} ' + message);
}

    if (is_completed) {
      setTimeout(() => endGame(), 1200);
    } else if (is_lost) {

      showMessage('\u{1F480} ' + (loss_reason || 'Mission failed!'), 'error');
      setTimeout(() => endGame(), 2000);
    } else if (gs.budget <= 0) {
      showMessage('\u{1F480} CO₂ budget exhausted!', 'error');
      setTimeout(() => endGame(), 1500);
    }
  } catch(e) { showMessage('API error: '+e.message,'error'); }
}


//START & ENDGAME
async function startGame() {
  const name = document.getElementById('playerNameInput').value.trim();
  if (!name) { document.getElementById('playerNameInput').focus(); return; }

  st.playerName = name;
  st.sessionId  = 'sess_'+Date.now()+'_'+Math.random().toString(36).slice(2);

  [st.flightLines, st.minimapLines, st.visitedMarkers, st.optionMarkers].forEach(arr => {
    arr.forEach(l => { try { map.removeLayer(l); } catch(e){} });
    arr.length = 0;
  });
  if (st.currentMarker) { map.removeLayer(st.currentMarker); st.currentMarker = null; }

  try {
    const res  = await fetch(API+'/start', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ session_id:st.sessionId, name }),
    });
    const data = await res.json();
    if (data.status !== 'success') { alert('Failed to start.'); return; }
    showScreen('gameScreen');
    setTimeout(async () => { map.invalidateSize(); minimap.invalidateSize(); await loadStatus(); }, 300);
  } catch(e) { alert('Cannot reach server.\nMake sure app.py is running.\n'+e.message); }
}

async function endGame() {
  try {
    const res  = await fetch(API+'/game-over', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ session_id:st.sessionId }),
    });
    const data = await res.json();
    const r    = data.result || {};
    const ok   = r.is_won;

    document.getElementById('resultName').textContent     = st.playerName;
    document.getElementById('resultScore').textContent    = r.final_score||0;
    document.getElementById('resultBudget').textContent   = r.budget_left||0;
    document.getElementById('resultParts').textContent    = (r.parts_count||0)+'/5';
    document.getElementById('resultAirports').textContent = (r.airports_count||0)+'/10';
    document.getElementById('resultRating').textContent   = r.rating ? r.rating.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim() : '—';
    document.getElementById('resultBadge').textContent    = '';
    document.getElementById('resultTitle').textContent    = ok ? 'Mission Accomplished!' : 'Mission Failed';
    document.getElementById('resultTitle').style.color    = ok ? 'var(--accent2)' : 'var(--danger)';

    saveScore({ name:st.playerName, score:r.final_score||0, parts:r.parts_count||0,
      airports:r.airports_count||0, date:new Date().toLocaleDateString() });
    showScreen('gameOverScreen');
  } catch(e) { showScreen('gameOverScreen'); }
}

//LEADERBOARD
const LB_KEY = 'ecobuilder_v3';

function getScores() { try { return JSON.parse(localStorage.getItem(LB_KEY))||[]; } catch(e){ return []; } }

function saveScore(entry) {
  const s = getScores(); s.push(entry); s.sort((a,b)=>b.score-a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(s.slice(0,10)));
}

function renderLB(id) {
  const el = document.getElementById(id);
  const s  = getScores();
  if (!s.length) { el.innerHTML = '<p class="hint">No scores yet!</p>'; return; }
  el.innerHTML = '';
  s.forEach((sc, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row'+(i<3?' rank-'+(i+1):'');
    row.innerHTML = `<div class="lb-rank">${i<3?MEDALS[i]:'#'+(i+1)}</div>
      <div class="lb-info"><div class="lb-name">${sc.name}</div>
      <div class="lb-detail">${sc.parts}/5 parts · ${sc.airports}/10 airports · ${sc.date}</div></div>
      <div class="lb-score">${sc.score}</div>`;
    el.appendChild(row);
  });
}

//EVENTS

document.getElementById('startGameBtn').onclick = startGame;
document.getElementById('playerNameInput').onkeydown = e => { if(e.key==='Enter') startGame(); };
document.getElementById('endGameBtn').onclick = endGame;
document.getElementById('playAgainBtn').onclick = () => {
  document.getElementById('playerNameInput').value = '';
  document.getElementById('leaderboardResult').classList.add('hidden');
  showScreen('welcomeScreen');
};

document.getElementById('toggleLeaderboardBtn').onclick = () => {
  renderLB('leaderboardList');
  document.getElementById('leaderboardOverlay').classList.remove('hidden');
};

document.getElementById('closeLeaderboardBtn').onclick = () => document.getElementById('leaderboardOverlay').classList.add('hidden');
document.getElementById('leaderboardOverlay').onclick = e => { if(e.target===e.currentTarget) document.getElementById('leaderboardOverlay').classList.add('hidden'); };
document.getElementById('showLeaderboardResultBtn').onclick = () => {
  const el = document.getElementById('leaderboardResult');
  if (el.classList.contains('hidden')) { renderLB('leaderboardResultList'); el.classList.remove('hidden'); }
  else el.classList.add('hidden');
};

document.addEventListener('keydown', e => { if(e.key==='Escape') document.getElementById('leaderboardOverlay').classList.add('hidden'); });

window.addEventListener('load', () => { initMaps(); showScreen('welcomeScreen'); });

function showCelebration() {

  const el = document.createElement('div');

  el.innerHTML = '\u{1F389}';

  el.style.position = 'fixed';
  el.style.top = '40%';
  el.style.left = '50%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.fontSize = '60px';
  el.style.zIndex = '9999';
  el.style.pointerEvents = 'none';

  document.body.appendChild(el);

  el.animate([
    { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },

  ], {
    duration: 400
  });

  setTimeout(() => {
    el.remove();
  }, 2000);
}
