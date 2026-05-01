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
