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

