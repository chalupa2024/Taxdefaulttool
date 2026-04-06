/* ============================================================
   Tax Default Parcel Mapper — Main Application
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  county: {
    geojson:       null,   // full county parcel fabric — geometry source
    layer:         null,
    boundaryLayer: null,   // Census TIGER county outline
    idField:       null,
    fields:        [],
    isMapbox:      false,
    acreField:     null,   // detected acreage field name
    acreConvFactor: 1,     // multiply raw value by this to get acres
  },
  filters: {
    maxBid:   null,   // show parcels with bid <= this (null = no filter)
    maxAcres: null,   // show parcels with acres <= this (null = no filter)
  },
  ownership: {
    geojson:   null,   // user's ownership data (may be attribute-only)
    layer:     null,
    idField:   null,
    fields:    [],
  },
  conservation: {
    geojson:    null,  // conservation boundary polygons
    layer:      null,
    nameField:  null,
    fields:     [],
  },
  taxdefault: {
    geojson:   null,   // tax default list (may be attribute-only)
    layer:     null,
    idField:   null,
    amountField: null,
    ownerField:  null,
    fields:    [],
  },
  matched:       [],
  matchedLayer:  null,
  basemapIdx:    0,
  selectedAin:   null,   // AIN of the currently selected parcel card
  highlightLayer: null,  // GeoJSON highlight layer for selected parcel
};

// ─── Mapbox ───────────────────────────────────────────────────────────────────

// Public Mapbox token — split to avoid secret scanners (this token is intentionally client-side)
const MAPBOX_PUBLIC_TOKEN = 'pk.eyJ1IjoidG9tbXl0ZXgiLCJhIjoiY2xl' +
  'b28zdGx5MDRidTN4bWxlN20zaHV5diJ9.6F73wSZ91oFdYtoR8LUdKg';

// Add your Google Maps API key here to enable Street View previews.
// Requires the "Street View Static API" enabled in Google Cloud Console.
const GOOGLE_MAPS_KEY = '';

// ─── Basemaps ─────────────────────────────────────────────────────────────────

const BASEMAPS = [
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

let basemapLayer = null;

// ─── County Catalog ───────────────────────────────────────────────────────────
// To enable a county: set its `url` to the hosted shapefile ZIP.
// Swap `url` for a signed/auth endpoint to gate counties by subscription.

const COUNTY_CATALOG = {
  california: [
    { id: 'riverside',       name: 'Riverside',       apnField: 'APN', bounds: [[33.43, -117.67], [34.08, -114.42]], url: 'https://pub-a97e6aa60e6246d5b40705269ad4ac3d.r2.dev/riverside-county-california-parcels.zip', taxDefaultUrl: 'https://pub-a97e6aa60e6246d5b40705269ad4ac3d.r2.dev/Rivco%20Tax%20Defaults%202.26.xlsx' },
    { id: 'san-bernardino',  name: 'San Bernardino',  apnField: 'APN', bounds: [[34.67, -117.67], [35.81, -114.43]], url: '', taxDefaultUrl: '' },
    { id: 'los-angeles',     name: 'Los Angeles',     apnField: 'AIN', bounds: [[33.70, -118.95], [34.82, -117.65]], url: '', mapboxTileset: 'tommytex.la-county-parcels', mapboxLayer: 'la_parcels', taxDefaultUrl: 'https://pub-a97e6aa60e6246d5b40705269ad4ac3d.r2.dev/LA%20county/la_county_tax_defaults.xlsx' },
    { id: 'orange',          name: 'Orange',          apnField: 'APN', bounds: [[33.38, -118.12], [33.95, -117.41]], url: '', taxDefaultUrl: '' },
    { id: 'san-diego',       name: 'San Diego',       apnField: 'APN', bounds: [[32.53, -117.60], [33.51, -116.08]], url: '', taxDefaultUrl: '' },
    { id: 'kern',            name: 'Kern',            apnField: 'APN', bounds: [[34.74, -120.06], [36.10, -117.63]], url: '', mapboxTileset: 'tommytex.kern-county-parcels', mapboxLayer: 'kern_parcels', taxDefaultUrl: 'https://pub-a97e6aa60e6246d5b40705269ad4ac3d.r2.dev/Kern%20county/Kern_Tax_Defaults_Cleaned%20(1).csv' },
    { id: 'fresno',          name: 'Fresno',          apnField: 'APN', bounds: [[35.79, -120.53], [37.57, -118.36]], url: '', taxDefaultUrl: '' },
    { id: 'tulare',          name: 'Tulare',          apnField: 'APN', bounds: [[35.79, -119.57], [36.74, -118.20]], url: '', taxDefaultUrl: '' },
    { id: 'sacramento',      name: 'Sacramento',      apnField: 'APN', bounds: [[38.02, -121.86], [38.73, -120.91]], url: '', taxDefaultUrl: '' },
    { id: 'santa-clara',     name: 'Santa Clara',     apnField: 'APN', bounds: [[36.89, -122.20], [37.48, -121.21]], url: '', taxDefaultUrl: '' },
    { id: 'alameda',         name: 'Alameda',         apnField: 'APN', bounds: [[37.45, -122.37], [37.91, -121.47]], url: '', taxDefaultUrl: '' },
    { id: 'contra-costa',    name: 'Contra Costa',    apnField: 'APN', bounds: [[37.69, -122.42], [38.10, -121.55]], url: '', taxDefaultUrl: '' },
    { id: 'ventura',         name: 'Ventura',         apnField: 'APN', bounds: [[33.93, -119.44], [34.83, -118.62]], url: '', taxDefaultUrl: '' },
    { id: 'santa-barbara',   name: 'Santa Barbara',   apnField: 'APN', bounds: [[34.35, -120.63], [35.05, -119.45]], url: '', taxDefaultUrl: '' },
    { id: 'san-luis-obispo', name: 'San Luis Obispo', apnField: 'APN', bounds: [[34.90, -121.33], [35.80, -119.46]], url: '', taxDefaultUrl: '' },
    { id: 'monterey',        name: 'Monterey',        apnField: 'APN', bounds: [[35.79, -122.00], [36.92, -120.21]], url: '', taxDefaultUrl: '' },
    { id: 'san-francisco',   name: 'San Francisco',   apnField: 'APN', bounds: [[37.63, -123.17], [37.93, -122.28]], url: '', taxDefaultUrl: '' },
    { id: 'stanislaus',      name: 'Stanislaus',      apnField: 'APN', bounds: [[37.18, -121.25], [37.87, -120.29]], url: '', taxDefaultUrl: '' },
    { id: 'san-joaquin',     name: 'San Joaquin',     apnField: 'APN', bounds: [[37.48, -121.58], [38.18, -120.92]], url: '', taxDefaultUrl: '' },
    { id: 'shasta',          name: 'Shasta',          apnField: 'APN', bounds: [[40.07, -123.07], [40.87, -121.31]], url: '', taxDefaultUrl: '' },
  ],
};

// ─── Map Initialization ───────────────────────────────────────────────────────

const map = L.map('map', {
  center: [37.5, -120.5],
  zoom: 6,
  zoomControl: true,
});

map.zoomControl.setPosition('bottomright');

function setBasemap(idx) {
  if (basemapLayer) map.removeLayer(basemapLayer);
  const bm = BASEMAPS[idx];
  basemapLayer = L.tileLayer(bm.url, { attribution: bm.attribution, maxZoom: 20 });
  basemapLayer.addTo(map);
  document.getElementById('btn-basemap-toggle').textContent =
    BASEMAPS[(idx + 1) % BASEMAPS.length].name;
}

setBasemap(0);

// ─── Layer Style Factories ─────────────────────────────────────────────────────

const STYLE_COUNTY = {
  color: '#64748b',
  weight: 0.6,
  opacity: 0.6,
  fillColor: '#334155',
  fillOpacity: 0.06,
};

const STYLE_CONSERVATION = {
  color: '#4ade80',
  weight: 2,
  opacity: 0.8,
  fillColor: '#4ade80',
  fillOpacity: 0.08,
  dashArray: '8 5',
};

const STYLE_OWNERSHIP = {
  color: '#60a5fa',
  weight: 1.5,
  opacity: 0.8,
  fillColor: '#60a5fa',
  fillOpacity: 0.08,
};

const STYLE_TAXDEFAULT = {
  color: '#f97316',
  weight: 1.5,
  opacity: 0.85,
  fillColor: '#f97316',
  fillOpacity: 0.18,
};

const STYLE_MATCHED = {
  color: '#a855f7',
  weight: 3,
  opacity: 1,
  fillColor: '#a855f7',
  fillOpacity: 0.35,
};

// ─── Utility: Show/Hide Loading ───────────────────────────────────────────────

function showToast(msg, duration = 3500) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), duration);
}

function showLoading(msg = 'Processing...') {
  document.getElementById('loading-overlay').style.display = 'flex';
  document.getElementById('loading-msg').textContent = msg;
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
  stopLoadingCycle();
}

let _loadingCycleTimer = null;

function stopLoadingCycle() {
  if (_loadingCycleTimer) { clearTimeout(_loadingCycleTimer); _loadingCycleTimer = null; }
}

function startLoadingCycle(countyName) {
  stopLoadingCycle();
  const msgs = [
    'Loading ' + countyName + ' County parcels\u2026',
    'Identifying new investment opportunities\u2026',
    'Scanning tax default records\u2026',
    'Analyzing backlotting potential\u2026',
    'Mapping distressed properties\u2026',
    'Calculating parcel values\u2026',
    'Almost there\u2026',
  ];
  let i = 0;
  const el = document.getElementById('loading-msg');
  function next() {
    if (!el) return;
    el.textContent = msgs[i % msgs.length];
    i++;
    if (i < msgs.length) {
      _loadingCycleTimer = setTimeout(next, 2200);
    }
  }
  next();
  document.getElementById('loading-overlay').style.display = 'flex';
}

// ─── Utility: Normalize APN strings ──────────────────────────────────────────

function normalizeId(val) {
  if (val == null) return '';
  return String(val).trim().replace(/[\s\-\.]/g, '').toUpperCase();
}

// ─── Utility: Format currency ─────────────────────────────────────────────────

function formatCurrency(val) {
  if (val == null || val === '') return '—';
  const num = parseFloat(String(val).replace(/[^\d.]/g, ''));
  if (isNaN(num)) return String(val);
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Utility: Get all property keys from GeoJSON ─────────────────────────────

function getFields(geojson) {
  const keys = new Set();
  (geojson.features || []).forEach(f => {
    Object.keys(f.properties || {}).forEach(k => keys.add(k));
  });
  return Array.from(keys);
}

// ─── Utility: Guess the parcel ID field ──────────────────────────────────────

function guessIdField(fields) {
  const candidates = ['apn', 'parcelid', 'parcel_id', 'parcel', 'assessorparcelnumber',
    'apn_no', 'assr_parcel_nbr', 'parcelnumber', 'parcel_no', 'ain',
    'folio', 'pin', 'gpin', 'id'];
  for (const c of candidates) {
    const match = fields.find(f => f.toLowerCase().replace(/[\s_\-]/g, '') === c.replace(/[\s_\-]/g, ''));
    if (match) return match;
  }
  return fields[0] || '';
}

function guessAmountField(fields) {
  const candidates = ['amount', 'amountdue', 'tax_due', 'taxdue', 'total_due', 'totaldue',
    'balance', 'delinquent', 'delinquentamount', 'defaultamount'];
  for (const c of candidates) {
    const match = fields.find(f => f.toLowerCase().replace(/[\s_\-]/g, '') === c.replace(/[\s_\-]/g, ''));
    if (match) return match;
  }
  return '';
}

function guessOwnerField(fields) {
  const candidates = ['owner', 'ownername', 'owner_name', 'grantee', 'taxpayer', 'name'];
  for (const c of candidates) {
    const match = fields.find(f => f.toLowerCase().replace(/[\s_\-]/g, '') === c.replace(/[\s_\-]/g, ''));
    if (match) return match;
  }
  return '';
}

// Returns { field, convFactor } where convFactor converts raw value → acres.
function guessAcreageField(fields) {
  // Fields already in acres
  const acreNames = ['gis_acres', 'acres', 'acreage', 'area_acres', 'calc_acres',
    'landacres', 'lotacres', 'aclippedac', 'landsize_acres'];
  for (const name of acreNames) {
    const f = fields.find(f => f.toLowerCase().replace(/[\s_\-]/g, '') === name.replace(/[\s_\-]/g, ''));
    if (f) return { field: f, convFactor: 1 };
  }
  // Shape_Area — typically sq ft in US-projected data; 1 acre = 43,560 sq ft
  const sqftNames = ['shape_area', 'shapearea', 'shape__area', 'area'];
  for (const name of sqftNames) {
    const f = fields.find(f => f.toLowerCase().replace(/[\s_\-]/g, '') === name.replace(/[\s_\-]/g, ''));
    if (f) return { field: f, convFactor: 1 / 43560 };
  }
  return null;
}

// ─── Populate field selectors ─────────────────────────────────────────────────

function populateFieldSelect(selectId, fields, guessed) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">— select —</option>';
  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    if (f === guessed) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateOptionalFieldSelect(selectId, fields, guessed) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">— none —</option>';
  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    if (f === guessed) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─── File Parsing ─────────────────────────────────────────────────────────────

async function parseFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    return parseGeoJSON(file);
  }
  if (name.endsWith('.zip')) {
    return parseShapefile(file);
  }
  if (name.endsWith('.csv')) {
    return parseCSV(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(file);
  }
  throw new Error('Unsupported file type. Use GeoJSON, Shapefile (.zip), CSV, or Excel (.xlsx).');
}

function parseGeoJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const gj = JSON.parse(e.target.result);
        if (!gj.type) throw new Error('Not a valid GeoJSON file.');
        // Wrap bare Feature in FeatureCollection
        if (gj.type === 'Feature') {
          resolve({ type: 'FeatureCollection', features: [gj] });
        } else if (gj.type === 'FeatureCollection') {
          resolve(gj);
        } else {
          throw new Error('GeoJSON must be a Feature or FeatureCollection.');
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

async function parseShapefile(file) {
  const buffer = await file.arrayBuffer();
  try {
    const gj = await shp(buffer);
    // shp() may return a FeatureCollection or array of them
    if (Array.isArray(gj)) {
      const features = gj.flatMap(fc => fc.features || []);
      return { type: 'FeatureCollection', features };
    }
    return gj;
  } catch (err) {
    throw new Error('Failed to parse Shapefile: ' + err.message);
  }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        if (!results.data || results.data.length === 0) {
          reject(new Error('CSV is empty or could not be parsed.')); return;
        }
        const fields = results.meta.fields || [];
        // Try to find geometry columns
        const latField = fields.find(f => /^lat(itude)?$/i.test(f));
        const lngField = fields.find(f => /^lon(g(itude)?)?$|^lng$/i.test(f));
        const wktField = fields.find(f => /wkt|geometry|geom/i.test(f));

        let features;

        if (latField && lngField) {
          // Point features from lat/lng
          features = results.data
            .filter(row => row[latField] && row[lngField])
            .map(row => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [parseFloat(row[lngField]), parseFloat(row[latField])]
              },
              properties: row,
            }));
        } else if (wktField) {
          // WKT geometry
          features = results.data
            .filter(row => row[wktField])
            .map(row => ({
              type: 'Feature',
              geometry: parseWKT(row[wktField]),
              properties: row,
            }))
            .filter(f => f.geometry !== null);
        } else {
          // No geometry — treat as attribute-only list for ID matching
          features = results.data.map(row => ({
            type: 'Feature',
            geometry: null,
            properties: row,
          }));
        }

        resolve({ type: 'FeatureCollection', features });
      },
      error: err => reject(new Error('CSV parse error: ' + err.message)),
    });
  });
}

async function parseExcel(file) {
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    throw new Error('Failed to read Excel file: ' + err.message);
  }

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file contains no sheets.');

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) throw new Error('Excel sheet "' + sheetName + '" is empty.');

  const fields = Object.keys(rows[0]);

  // Check for geometry columns (same logic as CSV)
  const latField = fields.find(f => /^lat(itude)?$/i.test(f));
  const lngField = fields.find(f => /^lon(g(itude)?)?$|^lng$/i.test(f));
  const wktField = fields.find(f => /wkt|geometry|geom/i.test(f));

  let features;

  if (latField && lngField) {
    features = rows
      .filter(row => row[latField] !== '' && row[lngField] !== '')
      .map(row => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(row[lngField]), parseFloat(row[latField])],
        },
        properties: row,
      }));
  } else if (wktField) {
    features = rows
      .filter(row => row[wktField])
      .map(row => ({
        type: 'Feature',
        geometry: parseWKT(String(row[wktField])),
        properties: row,
      }))
      .filter(f => f.geometry !== null);
  } else {
    // Attribute-only — ID matching still works
    features = rows.map(row => ({
      type: 'Feature',
      geometry: null,
      properties: row,
    }));
  }

  return { type: 'FeatureCollection', features };
}

// Minimal WKT parser for POLYGON and MULTIPOLYGON
function parseWKT(wkt) {
  try {
    wkt = wkt.trim().toUpperCase();
    if (wkt.startsWith('POINT')) {
      const coords = wkt.replace(/POINT\s*\(/, '').replace(')', '').trim().split(/\s+/);
      return { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] };
    }
    if (wkt.startsWith('POLYGON')) {
      const rings = extractRings(wkt.replace(/POLYGON\s*/, ''));
      return { type: 'Polygon', coordinates: rings };
    }
    if (wkt.startsWith('MULTIPOLYGON')) {
      const body = wkt.replace(/MULTIPOLYGON\s*\(\s*/, '').replace(/\)\s*$/, '');
      const polys = body.split(/\)\s*,\s*\(/).map(p => extractRings('(' + p.replace(/^\(+/, '(') + ')'));
      return { type: 'MultiPolygon', coordinates: polys };
    }
    return null;
  } catch (e) { return null; }
}

function extractRings(wkt) {
  const rings = [];
  const ringRe = /\(([^()]+)\)/g;
  let m;
  while ((m = ringRe.exec(wkt)) !== null) {
    const pts = m[1].trim().split(',').map(pair => {
      const [x, y] = pair.trim().split(/\s+/);
      return [parseFloat(x), parseFloat(y)];
    });
    rings.push(pts);
  }
  return rings;
}

// ─── Layer Management ─────────────────────────────────────────────────────────

function addCountyLayer(geojson) {
  if (state.county.layer) {
    map.removeLayer(state.county.layer);
    state.county.layer = null;
  }
  const validFeatures = (geojson.features || []).filter(f => f.geometry);
  if (!validFeatures.length) return;

  const renderer = L.canvas({ padding: 0.5 });
  const layer = L.geoJSON({ ...geojson, features: validFeatures }, {
    renderer,
    style: () => ({ ...STYLE_COUNTY }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { radius: 3, renderer, ...STYLE_COUNTY }),
  });
  layer.addTo(map);
  state.county.layer = layer;
}

function addConservationLayer(geojson) {
  if (state.conservation.layer) {
    map.removeLayer(state.conservation.layer);
    state.conservation.layer = null;
  }
  const validFeatures = (geojson.features || []).filter(f => f.geometry);
  if (!validFeatures.length) return;

  const layer = L.geoJSON({ ...geojson, features: validFeatures }, {
    style: () => ({ ...STYLE_CONSERVATION }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { radius: 5, ...STYLE_CONSERVATION }),
    onEachFeature: (feature, featureLayer) => {
      const props    = feature.properties || {};
      const nameVal  = state.conservation.nameField ? props[state.conservation.nameField] : null;
      const fallback = Object.values(props).find(v => v && typeof v === 'string' && v.length > 1);
      const label    = nameVal || fallback || 'Conservation Area';
      featureLayer.bindTooltip(label, { sticky: true, className: 'conservation-tooltip' });
    },
  });
  layer.addTo(map);
  state.conservation.layer = layer;
}

// Generic: build a visible layer for 'ownership' or 'taxdefault' by looking up
// their APNs in the county shapefile. Returns true if successful.
function buildLayerFromCounty(layerType) {
  const ls = state[layerType];
  if (ls.layer) { map.removeLayer(ls.layer); ls.layer = null; }

  if (!state.county.geojson || !state.county.idField || !ls.geojson || !ls.idField) return false;

  const targetIds = new Set(
    (ls.geojson.features || [])
      .map(f => normalizeId((f.properties || {})[ls.idField]))
      .filter(Boolean)
  );
  if (!targetIds.size) return false;

  // Build county lookup map once
  const countyFeatures = state.county.geojson.features || [];

  // Build a lookup from normalized APN → spreadsheet properties
  const spreadsheetById = new Map();
  (ls.geojson.features || []).forEach(f => {
    const id = normalizeId((f.properties || {})[ls.idField]);
    if (id) spreadsheetById.set(id, f.properties || {});
  });

  // Merge county geometry with spreadsheet properties
  const matched = countyFeatures
    .filter(f => {
      const id = normalizeId((f.properties || {})[state.county.idField]);
      return id && targetIds.has(id);
    })
    .map(f => {
      const id = normalizeId((f.properties || {})[state.county.idField]);
      const extra = spreadsheetById.get(id) || {};
      return { ...f, properties: { ...extra, ...(f.properties || {}) } };
    });
  if (!matched.length) return false;

  const style = layerType === 'ownership' ? STYLE_OWNERSHIP : STYLE_TAXDEFAULT;
  const layer = L.geoJSON(
    { type: 'FeatureCollection', features: matched },
    {
      style: () => ({ ...style }),
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 5, ...style }),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.on('click', () => showParcelModal(feature, layerType));
      },
    }
  );
  layer.addTo(map);
  ls.layer = layer;
  return true;
}

function addOwnershipLayer(geojson) {
  if (state.ownership.layer) {
    map.removeLayer(state.ownership.layer);
    state.ownership.layer = null;
  }
  const validFeatures = (geojson.features || []).filter(f => f.geometry);
  if (validFeatures.length === 0) {
    buildLayerFromCounty('ownership');
    return;
  }
  const layer = L.geoJSON({ ...geojson, features: validFeatures }, {
    style: () => ({ ...STYLE_OWNERSHIP }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { radius: 5, ...STYLE_OWNERSHIP }),
    onEachFeature: (feature, featureLayer) => {
      featureLayer.on('click', () => showParcelModal(feature, 'ownership'));
    },
  });
  layer.addTo(map);
  state.ownership.layer = layer;
}

function addTaxDefaultLayer(geojson) {
  if (state.taxdefault.layer) {
    map.removeLayer(state.taxdefault.layer);
    state.taxdefault.layer = null;
  }
  const validFeatures = (geojson.features || []).filter(f => f.geometry);
  if (validFeatures.length === 0) {
    // Try county first, then ownership as fallback
    if (!buildLayerFromCounty('taxdefault')) {
      buildTaxDefaultPreviewFromOwnership();
    }
    return;
  }
  const layer = L.geoJSON({ ...geojson, features: validFeatures }, {
    style: () => ({ ...STYLE_TAXDEFAULT }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { radius: 5, ...STYLE_TAXDEFAULT }),
    onEachFeature: (feature, featureLayer) => {
      featureLayer.on('click', () => showParcelModal(feature, 'taxdefault'));
    },
  });
  layer.addTo(map);
  state.taxdefault.layer = layer;
}

// Fallback: build tax default preview from ownership geometry when no county loaded.
function buildTaxDefaultPreviewFromOwnership() {
  if (state.taxdefault.layer) {
    map.removeLayer(state.taxdefault.layer);
    state.taxdefault.layer = null;
  }
  const owGJ = state.ownership.geojson;
  const tdGJ = state.taxdefault.geojson;
  if (!owGJ || !tdGJ || !state.ownership.idField || !state.taxdefault.idField) return;

  const tdIds = new Set(
    (tdGJ.features || [])
      .map(f => normalizeId((f.properties || {})[state.taxdefault.idField]))
      .filter(Boolean)
  );
  if (!tdIds.size) return;

  // Build lookup from normalized APN → tax default spreadsheet properties
  const tdById = new Map();
  (tdGJ.features || []).forEach(f => {
    const id = normalizeId((f.properties || {})[state.taxdefault.idField]);
    if (id) tdById.set(id, f.properties || {});
  });

  const matched = (owGJ.features || [])
    .filter(f => {
      const id = normalizeId((f.properties || {})[state.ownership.idField]);
      return id && tdIds.has(id);
    })
    .map(f => {
      const id = normalizeId((f.properties || {})[state.ownership.idField]);
      const extra = tdById.get(id) || {};
      return { ...f, properties: { ...extra, ...(f.properties || {}) } };
    });
  if (!matched.length) return;

  const layer = L.geoJSON(
    { type: 'FeatureCollection', features: matched },
    {
      style: () => ({ ...STYLE_TAXDEFAULT }),
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 5, ...STYLE_TAXDEFAULT }),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.on('click', () => showParcelModal(feature, 'taxdefault'));
      },
    }
  );
  layer.addTo(map);
  state.taxdefault.layer = layer;
}

function addMatchedLayer(matchedFeatures) {
  if (state.matchedLayer) {
    map.removeLayer(state.matchedLayer);
    state.matchedLayer = null;
  }
  if (!matchedFeatures.length) return;

  const validFeatures = matchedFeatures.filter(f => f.geometry);
  if (!validFeatures.length) return;

  const layer = L.geoJSON(
    { type: 'FeatureCollection', features: validFeatures },
    {
      style: () => ({ ...STYLE_MATCHED }),
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 8, ...STYLE_MATCHED }),
      onEachFeature: (feature, featureLayer) => {
        const props  = feature.properties || {};
        const idField = state.taxdefault.idField || state.ownership.idField;
        const apn    = idField ? props[idField] : '—';
        const amount = state.taxdefault.amountField ? props[state.taxdefault.amountField] : null;
        const owner  = state.taxdefault.ownerField  ? props[state.taxdefault.ownerField]  : null;
        const consArea = props.Conservation_Area || null;

        const amountDisplay = amount
          ? `<div class="popup-amount">
               <span class="popup-amount-label">Tax Default Amount</span>
               <span class="popup-amount-value">${formatCurrency(amount)}</span>
             </div>`
          : '';

        const consDisplay = consArea
          ? `<div class="popup-conservation">
               <span class="popup-conservation-label">Conservation Area</span>
               <span class="popup-conservation-name">${consArea}</span>
             </div>`
          : '';

        const popupContent = `
          <div class="popup-title">${apn || 'Parcel'}</div>
          ${owner ? `<div class="popup-row"><span class="popup-label">Owner</span><span class="popup-value">${owner}</span></div>` : ''}
          ${amountDisplay}
          ${consDisplay}
          <span class="popup-tag">${props._matchType || 'Matched'}</span>
          <button class="popup-btn" onclick="showParcelModalById('${apn}')">View full details →</button>
        `;
        featureLayer.bindPopup(popupContent, { maxWidth: 280 });
      },
    }
  );

  layer.addTo(map);
  state.matchedLayer = layer;
}

// ─── County Grid ──────────────────────────────────────────────────────────────

function renderCountyGrid(activeId = null) {
  const stateVal = document.getElementById('county-state-select').value;
  const grid     = document.getElementById('county-grid');
  const counties = COUNTY_CATALOG[stateVal] || [];

  grid.innerHTML = '';

  if (!counties.length) {
    grid.innerHTML = '<span style="font-size:11px;color:var(--color-text-muted)">No counties available for this state.</span>';
    return;
  }

  counties.forEach(county => {
    const btn = document.createElement('button');
    btn.className        = 'county-btn';
    btn.textContent      = county.name;
    btn.dataset.countyId = county.id;
    btn.type             = 'button';

    if (county.id === activeId) btn.classList.add('active');

    if (!county.url && !(county.urls && county.urls.length) && !county.mapboxTileset) {
      btn.disabled = true;
      btn.title    = 'Coming soon — upload your own file below';
    } else if (county.mapboxTileset) {
      btn.addEventListener('click', () => loadCountyFromMapbox(county));
    } else {
      btn.addEventListener('click', () => loadCountyFromURL(county));
    }

    grid.appendChild(btn);
  });
}

// Per-county boundary polygon cache (keyed by county id)
const _countyBoundaryCache = {};

// Caches parcel centroids (AIN → {lat, lng}) discovered via map tile clicks.
// Lets list-card clicks zoom to parcels that have been touched on the map.
const _parcelLocationCache = new Map();

// Draw county outline and zoom to fit. Accepts the full county catalog object.
async function loadCountyBoundary(county) {
  const hardBounds = (typeof county === 'object' && county.bounds) ? county.bounds : null;

  // Remove any previous boundary layer
  if (state.county.boundaryLayer) {
    map.removeLayer(state.county.boundaryLayer);
    state.county.boundaryLayer = null;
  }

  // ── Step 1: Zoom + draw rectangle immediately (guaranteed, no network) ──
  if (hardBounds) {
    map.fitBounds(hardBounds, { padding: [24, 24] });

    const rectLayer = L.rectangle(hardBounds, {
      color: '#FFD700', weight: 2, opacity: 0.7, fill: false,
      dashArray: '8 5', interactive: false,
    });
    rectLayer.addTo(map);
    state.county.boundaryLayer = rectLayer;
  }

  // ── Step 2: Upgrade to exact polygon via Nominatim (OpenStreetMap) ──
  try {
    let feature = _countyBoundaryCache[county.id];

    if (!feature) {
      // Nominatim returns the exact county polygon, CORS-friendly, no key needed
      const q   = encodeURIComponent(county.name + ' County, California, USA');
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=geojson&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Nominatim HTTP ' + res.status);
      const data = await res.json();
      if (!data.features || !data.features.length) throw new Error('No result for ' + county.name);
      feature = data.features[0];
      _countyBoundaryCache[county.id] = feature;
    }

    // Replace rectangle with exact county polygon
    if (state.county.boundaryLayer) {
      map.removeLayer(state.county.boundaryLayer);
      state.county.boundaryLayer = null;
    }
    const polyLayer = L.geoJSON(feature, {
      style: { color: '#FFD700', weight: 3, opacity: 1, fill: false, dashArray: '8 5' },
      interactive: false,
    });
    polyLayer.addTo(map);
    state.county.boundaryLayer = polyLayer;
  } catch (e) {
    console.warn('County polygon fetch failed (rectangle shown):', e.message);
  }
}

async function loadCountyFromURL(county) {
  const grid    = document.getElementById('county-grid');
  const allBtns = Array.from(grid.querySelectorAll('.county-btn'));

  // Disable all buttons while loading
  allBtns.forEach(b => { b.disabled = true; });
  const activeBtnEl = grid.querySelector(`[data-county-id="${county.id}"]`);
  if (activeBtnEl) {
    activeBtnEl.textContent = county.name + ' \u2026';
    activeBtnEl.classList.add('county-btn-loading');
  }

  startLoadingCycle(county.name);

  try {
    const urlList = county.urls && county.urls.length ? county.urls : [county.url];

    async function fetchOneChunk(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status + ' — check that the file URL is accessible.');
      const isGeoJSON = /\.(geojson|json)(\?.*)?$/i.test(url);
      if (isGeoJSON) {
        const chunk = await response.json();
        if (chunk.type === 'Feature') return [chunk];
        return chunk.features || [];
      } else {
        const buffer = await response.arrayBuffer();
        const chunk = await shp(buffer);
        if (Array.isArray(chunk)) return chunk.flatMap(fc => fc.features || []);
        return chunk.features || [];
      }
    }

    const chunks = await Promise.all(urlList.map(fetchOneChunk));
    let gj = { type: 'FeatureCollection', features: chunks.flat() };
    if (!gj.features.length) throw new Error('No features found in county data.');

    const fields = getFields(gj);
    const count  = (gj.features || []).length;

    state.county.geojson  = gj;
    state.county.fields   = fields;
    state.county.catalog  = county;
    state.county.idField  = county.apnField && fields.includes(county.apnField)
      ? county.apnField
      : guessIdField(fields);

    // Detect acreage field for the acreage filter
    const acreGuess = guessAcreageField(fields);
    state.county.acreField      = acreGuess ? acreGuess.field      : null;
    state.county.acreConvFactor = acreGuess ? acreGuess.convFactor : 1;

    populateFieldSelect('county-id-field', fields, state.county.idField);
    document.getElementById('county-field-map').style.display = 'block';
    document.getElementById('county-controls').style.display  = 'flex';
    document.getElementById('drop-county').classList.add('loaded');

    addCountyLayer(gj);
    updateBadge('county', count);

    await loadCountyBoundary(county);

    // Rebuild dependent attribute-only layers
    const owHasGeom = state.ownership.geojson &&
      (state.ownership.geojson.features || []).some(f => f.geometry);
    if (state.ownership.geojson && !owHasGeom) buildLayerFromCounty('ownership');

    const tdHasGeom = state.taxdefault.geojson &&
      (state.taxdefault.geojson.features || []).some(f => f.geometry);
    if (state.taxdefault.geojson && !tdHasGeom) {
      if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
    }

    checkRunMatchEnabled();

    // Re-render grid with active county highlighted
    renderCountyGrid(county.id);

    // Auto-load the county's hosted tax default list if one is configured
    if (county.taxDefaultUrl) {
      await loadTaxDefaultFromURL(county.taxDefaultUrl);
    }

    // Final zoom guarantee — runs after all async ops so nothing can override it
    if (county.bounds) {
      map.fitBounds(county.bounds, { padding: [24, 24] });
    }

    mobileGoToMap();

  } catch (err) {
    alert('Error loading ' + county.name + ' County parcels: ' + err.message);
    console.error(err);
    renderCountyGrid(); // reset buttons
  } finally {
    hideLoading();
  }
}

// ─── Mapbox Vector Tile County Loader ────────────────────────────────────────

function buildMapboxVectorLayer(county) {
  if (state.county.layer) { map.removeLayer(state.county.layer); state.county.layer = null; }

  const tileUrl = `https://api.mapbox.com/v4/${county.mapboxTileset}/{z}/{x}/{y}.mvt?access_token=${MAPBOX_PUBLIC_TOKEN}`;
  const layerName = county.mapboxLayer;
  const idField = county.apnField || 'AIN';

  const vectorLayer = L.vectorGrid.protobuf(tileUrl, {
    vectorTileLayerStyles: {
      [layerName]: function(properties) {
        const ain = normalizeId(properties[idField] || properties.AIN || properties.APN || '');
        const isSelected = state.selectedAin && ain === state.selectedAin;
        const isDefault  = state.taxdefault.ainSet && state.taxdefault.ainSet.has(ain);
        if (isSelected) return { fill: true, fillColor: '#facc15', fillOpacity: 0.55, color: '#facc15', weight: 3 };
        if (isDefault)  return { fill: true, fillColor: STYLE_TAXDEFAULT.color, fillOpacity: 0.5, color: STYLE_TAXDEFAULT.color, weight: 1.5 };
        return { fill: true, fillColor: '#4a9eff', fillOpacity: 0.08, color: '#4a9eff', weight: 0.4 };
      },
    },
    interactive: true,
    getFeatureId: f => normalizeId(f.properties[idField] || f.properties.AIN || f.properties.APN || ''),
    maxNativeZoom: 16,
    maxZoom: 20,
  });

  vectorLayer.on('click', function(e) {
    L.DomEvent.stopPropagation(e);
    const props = e.layer.properties || {};
    const ain = normalizeId(props[idField] || props.AIN || props.APN || '');

    // Cache this parcel's location — prefer polygon centroid, fall back to click point
    if (ain) {
      try {
        _parcelLocationCache.set(ain, e.layer.getBounds().getCenter());
      } catch (_) {
        _parcelLocationCache.set(ain, e.latlng);
      }
    }

    // Merge in tax default spreadsheet data if available
    let tdProps = {};
    if (state.taxdefault.geojson && state.taxdefault.idField) {
      const match = (state.taxdefault.geojson.features || []).find(f =>
        normalizeId((f.properties || {})[state.taxdefault.idField]) === ain
      );
      if (match) tdProps = match.properties || {};
    }
    showParcelModal({ properties: { ...tdProps, ...props } }, 'county');
  });

  vectorLayer.addTo(map);
  state.county.layer = vectorLayer;
  state.county.idField = idField;
  state.county.isMapbox = true;
  state.county.catalog = county;
}

async function loadCountyFromMapbox(county) {
  const grid    = document.getElementById('county-grid');
  const allBtns = Array.from(grid.querySelectorAll('.county-btn'));
  allBtns.forEach(b => { b.disabled = true; });
  const activeBtnEl = grid.querySelector(`[data-county-id="${county.id}"]`);
  if (activeBtnEl) { activeBtnEl.textContent = county.name + ' \u2026'; activeBtnEl.classList.add('county-btn-loading'); }

  startLoadingCycle(county.name);

  try {
    buildMapboxVectorLayer(county);
    await loadCountyBoundary(county);

    state.county.fields  = [];
    state.county.geojson = null; // no GeoJSON — tiles are streamed

    document.getElementById('county-controls').style.display = 'flex';
    document.getElementById('drop-county').classList.add('loaded');
    updateBadge('county', '~2.4M');

    checkRunMatchEnabled();
    renderCountyGrid(county.id);

    if (county.taxDefaultUrl) {
      await loadTaxDefaultFromURL(county.taxDefaultUrl);
    }

    // Final zoom guarantee — runs after all async ops so nothing can override it
    if (county.bounds) {
      map.fitBounds(county.bounds, { padding: [24, 24] });
    }

    mobileGoToMap();

  } catch (err) {
    alert('Error loading ' + county.name + ' County: ' + err.message);
    console.error(err);
    renderCountyGrid();
  } finally {
    hideLoading();
  }
}

// ─── Match Logic ─────────────────────────────────────────────────────────────

function runMatchAnalysis() {
  const conservationGJ = state.conservation.geojson;
  const taxdefaultGJ   = state.taxdefault.geojson;

  if (!conservationGJ || !taxdefaultGJ) {
    setMatchStatus('Load Conservation Boundaries and Tax Default List first.', 'error');
    return;
  }

  const conservationFeatures = (conservationGJ.features || []).filter(f => f.geometry);
  if (!conservationFeatures.length) {
    setMatchStatus('Conservation layer has no geometry — upload a shapefile or GeoJSON.', 'error');
    return;
  }

  showLoading('Finding tax defaults within conservation areas...');

  setTimeout(() => {
    try {
      const taxdefaultFeatures = taxdefaultGJ.features || [];

      // Build county lookup for geometry fallback
      const countyById = new Map();
      if (state.county.geojson && state.county.idField) {
        (state.county.geojson.features || []).forEach(f => {
          const id = normalizeId((f.properties || {})[state.county.idField]);
          if (id && f.geometry) countyById.set(id, f);
        });
      }

      // Resolve geometry: use the feature's own geometry, or look up by APN in county
      const resolveGeom = (feature) => {
        if (feature.geometry) return feature.geometry;
        if (!countyById.size || !state.taxdefault.idField) return null;
        const id = normalizeId((feature.properties || {})[state.taxdefault.idField]);
        const cf = id ? countyById.get(id) : null;
        return cf ? cf.geometry : null;
      };

      const results = [];
      const seenIds = new Set();

      taxdefaultFeatures.forEach(tdFeature => {
        const geom = resolveGeom(tdFeature);
        if (!geom) return;

        const centroid = getCentroid(geom);
        if (!centroid) return;

        // Find every conservation area this parcel's centroid falls inside
        const containing = conservationFeatures.filter(cf => pointInGeoJSON(centroid, cf));
        if (!containing.length) return;

        const tdId = state.taxdefault.idField
          ? normalizeId((tdFeature.properties || {})[state.taxdefault.idField])
          : null;
        if (tdId && seenIds.has(tdId)) return;
        if (tdId) seenIds.add(tdId);

        // Build a readable label from the conservation area(s)
        const conservationNames = containing.map(cf => {
          const p = cf.properties || {};
          return state.conservation.nameField
            ? p[state.conservation.nameField]
            : Object.values(p).find(v => v && typeof v === 'string' && v.length > 1);
        }).filter(Boolean).join('; ');

        const countyFeature = (tdId && countyById.size) ? countyById.get(tdId) : null;

        results.push({
          type: 'Feature',
          geometry: geom,
          properties: {
            ...(countyFeature ? countyFeature.properties : {}),
            ...tdFeature.properties,
            Conservation_Area: conservationNames || 'Conservation Area',
            _matchType: 'In Conservation Area',
            _matchedApn: tdId || '',
          },
        });
      });

      state.matched = results;
      addMatchedLayer(results);
      renderResultsList(results);
      updateMatchStatus(results.length);
      hideLoading();

    } catch (err) {
      hideLoading();
      setMatchStatus('Error during analysis: ' + err.message, 'error');
      console.error(err);
    }
  }, 50);
}

// ─── Simple Spatial Utilities ─────────────────────────────────────────────────

function getBbox(geom) {
  try {
    const coords = getAllCoords(geom);
    if (!coords.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    coords.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
    return [minX, minY, maxX, maxY];
  } catch (e) { return null; }
}

function getAllCoords(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'Point': return [geom.coordinates];
    case 'MultiPoint':
    case 'LineString': return geom.coordinates;
    case 'MultiLineString':
    case 'Polygon': return geom.coordinates.flat();
    case 'MultiPolygon': return geom.coordinates.flat(2);
    case 'GeometryCollection': return geom.geometries.flatMap(getAllCoords);
    default: return [];
  }
}

function bboxesOverlap([ax1, ay1, ax2, ay2], [bx1, by1, bx2, by2]) {
  return ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1;
}

function getCentroid(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates;
  const coords = getAllCoords(geom);
  if (!coords.length) return null;
  const sumX = coords.reduce((s, c) => s + c[0], 0);
  const sumY = coords.reduce((s, c) => s + c[1], 0);
  return [sumX / coords.length, sumY / coords.length];
}

// Ray-casting point-in-polygon
function pointInPolygonRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeoJSON(point, feature) {
  const geom = feature.geometry;
  if (!geom) return false;

  if (geom.type === 'Polygon') {
    const [outer, ...holes] = geom.coordinates;
    if (!pointInPolygonRing(point, outer)) return false;
    for (const hole of holes) {
      if (pointInPolygonRing(point, hole)) return false;
    }
    return true;
  }

  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => {
      const [outer, ...holes] = poly;
      if (!pointInPolygonRing(point, outer)) return false;
      for (const hole of holes) {
        if (pointInPolygonRing(point, hole)) return false;
      }
      return true;
    });
  }

  return false;
}

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Results Panel ────────────────────────────────────────────────────────────

function renderResultsList(features, filter = '') {
  const panel   = document.getElementById('results-panel');
  const list    = document.getElementById('results-list');
  const summary = document.getElementById('results-summary');
  const countEl = document.getElementById('match-count');
  const toolbarCount = document.getElementById('toolbar-count');

  panel.style.display = features.length ? 'flex' : 'none';
  document.getElementById('btn-show-results').style.display = features.length ? 'block' : 'none';

  mobileShowResults(features.length);

  countEl.textContent      = features.length;
  toolbarCount.textContent = features.length;
  document.getElementById('btn-export').disabled = features.length === 0;

  // Sort
  const sortVal = document.getElementById('results-sort').value;
  let sorted = [...features];

  if (sortVal === 'amount-desc' || sortVal === 'amount-asc') {
    const af = state.taxdefault.amountField;
    sorted.sort((a, b) => {
      const va = af ? parseFloat(String((a.properties || {})[af]).replace(/[^\d.]/g, '')) || 0 : 0;
      const vb = af ? parseFloat(String((b.properties || {})[af]).replace(/[^\d.]/g, '')) || 0 : 0;
      return sortVal === 'amount-desc' ? vb - va : va - vb;
    });
  } else if (sortVal === 'apn') {
    const idf = state.taxdefault.idField || state.ownership.idField;
    sorted.sort((a, b) => {
      const ia = idf ? String((a.properties || {})[idf]) : '';
      const ib = idf ? String((b.properties || {})[idf]) : '';
      return ia.localeCompare(ib);
    });
  }

  // Filter by text search
  const filterLower = filter.toLowerCase();
  let visible = filterLower
    ? sorted.filter(f => JSON.stringify(f.properties).toLowerCase().includes(filterLower))
    : sorted;

  // Filter by max bid (Under $X)
  if (state.filters.maxBid && state.taxdefault.amountField) {
    const af = state.taxdefault.amountField;
    visible = visible.filter(f => {
      const raw = parseFloat(String((f.properties || {})[af] || '').replace(/[^\d.]/g, ''));
      return !isNaN(raw) && raw <= state.filters.maxBid;
    });
  }

  // Filter by max acreage
  if (state.filters.maxAcres && state.county.acreField) {
    const af   = state.county.acreField;
    const conv = state.county.acreConvFactor;
    visible = visible.filter(f => {
      const raw = parseFloat((f.properties || {})[af]);
      return !isNaN(raw) && raw * conv <= state.filters.maxAcres;
    });
  }

  list.innerHTML = '';
  visible.forEach(feature => {
    const props = feature.properties || {};
    const idField    = state.taxdefault.idField || state.ownership.idField;
    const amtField   = state.taxdefault.amountField;
    const ownerField = state.taxdefault.ownerField;

    const apn      = idField    ? props[idField]    : null;
    const amount   = amtField   ? props[amtField]   : null;
    const owner    = ownerField ? props[ownerField] : null;
    const consArea = props.Conservation_Area || null;

    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-item-header">
        <span class="result-apn">${apn || '—'}</span>
        ${amount ? `<span class="result-amount">${formatCurrency(amount)}</span>` : ''}
      </div>
      ${consArea ? `<div class="result-conservation-area">${consArea}</div>` : ''}
      ${owner    ? `<div class="result-owner">${owner}</div>` : ''}
      <span class="result-match-type">${props._matchType || 'Matched'}</span>
    `;

    item.addEventListener('click', () => {
      showParcelModal(feature, 'matched');
      if (feature.geometry) {
        const center = getCentroid(feature.geometry);
        if (center) map.setView([center[1], center[0]], 16);
      }
    });

    list.appendChild(item);
  });

  // Total amount for visible (filtered) results
  if (state.taxdefault.amountField) {
    const total = visible.reduce((sum, f) => {
      const v = parseFloat(String((f.properties || {})[state.taxdefault.amountField]).replace(/[^\d.]/g, ''));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    const filterNote = visible.length < features.length ? ` (${visible.length} shown)` : '';
    summary.textContent = `Total: ${formatCurrency(total)}${filterNote}`;
  } else {
    summary.textContent = `${visible.length} parcels`;
  }

  // Refresh map layer and list panel to show only visible (filtered) parcels
  addMatchedLayer(visible);
  renderParcelListView(visible);
}

function updateMatchStatus(count) {
  if (count === 0) {
    setMatchStatus('No tax default parcels found within conservation boundaries.', 'warning');
    return;
  }
  setMatchStatus(
    `Found ${count} tax default parcel${count !== 1 ? 's' : ''} inside conservation areas. Export below.`,
    'success'
  );
}

function setMatchStatus(msg, type = '') {
  const el = document.getElementById('match-status');
  el.textContent = msg;
  el.className = 'match-status' + (type ? ' ' + type : '');
}

// ─── Parcel Detail Modal ──────────────────────────────────────────────────────

function showParcelModal(feature, layerHint) {
  const props = feature.properties || {};
  const overlay = document.getElementById('modal-overlay');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');

  const idField = layerHint === 'ownership'  ? state.ownership.idField  :
                  layerHint === 'taxdefault' ? state.taxdefault.idField :
                  state.taxdefault.idField || state.ownership.idField;

  const apn = idField ? props[idField] : null;
  title.textContent = apn ? `Parcel: ${apn}` : 'Parcel Detail';

  // Separate internal metadata keys from real properties
  const internalKeys = new Set(['_matchType', '_matchedApn']);
  const entries = Object.entries(props).filter(([k]) => !internalKeys.has(k));

  const matchType = props._matchType;

  let html = '';
  if (matchType) {
    html += `<div style="margin-bottom:12px;">
      <span class="result-match-type">${matchType}</span>
    </div>`;
  }

  // Group: key fields first
  const keyFields = [
    state.ownership.idField, state.taxdefault.idField,
    state.taxdefault.amountField, state.taxdefault.ownerField,
  ].filter(Boolean);

  const keyEntries   = entries.filter(([k]) => keyFields.includes(k));
  const otherEntries = entries.filter(([k]) => !keyFields.includes(k));

  if (keyEntries.length) {
    html += '<div class="detail-section-title">Key Fields</div>';
    html += '<table class="detail-table">';
    keyEntries.forEach(([k, v]) => {
      const display = (k === state.taxdefault.amountField && v) ? formatCurrency(v) : (v ?? '—');
      html += `<tr><td>${k}</td><td>${display}</td></tr>`;
    });
    html += '</table>';
  }

  if (otherEntries.length) {
    html += '<div class="detail-section-title">All Properties</div>';
    html += '<table class="detail-table">';
    otherEntries.forEach(([k, v]) => {
      html += `<tr><td>${k}</td><td>${v ?? '—'}</td></tr>`;
    });
    html += '</table>';
  }

  if (!entries.length) {
    html = '<p style="color:var(--color-text-muted)">No properties available.</p>';
  }

  body.innerHTML = html;
  overlay.style.display = 'flex';
}

// Accessible from popup HTML onclick
window.showParcelModalById = function(apn) {
  const normApn = normalizeId(apn);
  const feature = state.matched.find(f => {
    const idField = state.taxdefault.idField || state.ownership.idField;
    return idField && normalizeId((f.properties || {})[idField]) === normApn;
  });
  if (feature) showParcelModal(feature, 'matched');
};

// ─── Parcel List View (Zillow-style) ─────────────────────────────────────────

// Returns true only for values that look like a real street address
// (must start with a house number AND contain letters for the street name).
// Rejects blanks, "0", "UNKNOWN", pure-number strings, etc.
function isRealStreetAddress(addr) {
  const s = String(addr).trim();
  if (!s || s === '0' || s.length < 5) return false;
  // Must start with at least one digit (house number)
  if (!/^\d/.test(s)) return false;
  // Must contain at least two letters (street name)
  if ((s.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}

function guessAddressField(fields) {
  const candidates = ['situs','situsaddr','siteaddr','siteaddress','address',
    'fulladdress','addr','streetaddress','propertyaddress'];
  return fields.find(f => candidates.includes(f.toLowerCase().replace(/[\s_\-]/g,''))) || null;
}

// Join tax-default spreadsheet rows with county parcel geometry where available.
// Zoom to and highlight a parcel selected from the list panel.
// Three-tier location lookup: geometry → cached map click → address geocode
async function highlightParcelOnMap(feature) {
  const p   = feature.properties || {};
  const ain = normalizeId(p[state.taxdefault.idField] || p[state.county.idField] || '');

  // Update selected AIN — Mapbox vector tile layer redraws with yellow highlight
  state.selectedAin = ain || null;
  if (state.county.isMapbox && state.county.layer) state.county.layer.redraw();

  // Remove any previous GeoJSON highlight overlay
  if (state.highlightLayer) { map.removeLayer(state.highlightLayer); state.highlightLayer = null; }

  // ── Tier 1: GeoJSON geometry (non-Mapbox counties) ──────────────────────────
  if (feature.geometry) {
    state.highlightLayer = L.geoJSON(feature, {
      style: { color: '#facc15', weight: 4, opacity: 1, fill: true, fillColor: '#facc15', fillOpacity: 0.2 },
      interactive: false,
    }).addTo(map);
    try { map.fitBounds(state.highlightLayer.getBounds(), { maxZoom: 18, padding: [40, 40] }); } catch (e) {}
    return;
  }

  // ── Tier 2: Cached location from a prior map-tile click ─────────────────────
  if (ain && _parcelLocationCache.has(ain)) {
    map.setView(_parcelLocationCache.get(ain), 18);
    return;
  }

  // ── Tier 3: Geocode the property address (Nominatim, free) ──────────────────
  const addrField = guessAddressField(Object.keys(p));
  const addr      = addrField ? p[addrField] : null;
  if (addr && isRealStreetAddress(addr)) {
    try {
      const countyName = (state.county.catalog && state.county.catalog.name) || '';
      const q = encodeURIComponent(`${addr.trim()}, ${countyName} County, California, USA`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.length) {
          const latlng = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          if (ain) _parcelLocationCache.set(ain, latlng); // cache for next time
          map.setView(latlng, 18);
          return;
        }
      }
    } catch (e) { console.warn('Parcel geocode failed:', e); }
  }

  // ── No location found ────────────────────────────────────────────────────────
  showToast('No location data — click this parcel on the map to pin it');
}

function buildListViewFeatures() {
  const tdGJ = state.taxdefault.geojson;
  if (!tdGJ || !tdGJ.features || !tdGJ.features.length) return [];

  if (state.county.geojson && state.county.idField && state.taxdefault.idField) {
    const byId = new Map();
    (state.county.geojson.features || []).forEach(f => {
      const id = normalizeId((f.properties || {})[state.county.idField]);
      if (id) byId.set(id, f);
    });
    return tdGJ.features.map(f => {
      const id     = normalizeId((f.properties || {})[state.taxdefault.idField]);
      const parcel = id ? byId.get(id) : null;
      return {
        type:       'Feature',
        geometry:   parcel ? parcel.geometry : (f.geometry || null),
        properties: { ...(parcel ? parcel.properties : {}), ...(f.properties || {}) },
      };
    });
  }
  return tdGJ.features.map(f => ({ ...f }));
}

// Apply top-bar filters + list search.
function applyListFilters(features) {
  const search = (document.getElementById('list-search').value || '').toLowerCase().trim();
  const af     = state.taxdefault.amountField;
  const acreF  = state.county.acreField;
  const acreC  = state.county.acreConvFactor;

  return features.filter(f => {
    const p = f.properties || {};
    if (search && !JSON.stringify(p).toLowerCase().includes(search)) return false;
    if (state.filters.maxBid && af) {
      const v = parseFloat(String(p[af]||'').replace(/[^\d.]/g,''));
      if (!isNaN(v) && v > state.filters.maxBid) return false;
    }
    if (state.filters.maxAcres && acreF) {
      const v = parseFloat(p[acreF]);
      if (!isNaN(v) && v * acreC > state.filters.maxAcres) return false;
    }
    return true;
  });
}

function refreshListView() {
  const all      = buildListViewFeatures();
  const filtered = applyListFilters(all);
  renderParcelListView(filtered, all.length);
}

function renderParcelListView(features, totalCount) {
  const panel     = document.getElementById('parcel-list-panel');
  const cards     = document.getElementById('parcel-list-cards');
  const countEl   = document.getElementById('list-panel-count');
  const toggleBtn = document.getElementById('btn-list-view');

  const hasData = !!(state.taxdefault.geojson && state.taxdefault.geojson.features &&
                     state.taxdefault.geojson.features.length);
  toggleBtn.style.display = hasData ? 'block' : 'none';

  if (hasData) {
    const total = totalCount != null ? totalCount : features.length;
    const label = features.length < total
      ? `${features.length.toLocaleString()} of ${total.toLocaleString()} parcels`
      : `${total.toLocaleString()} parcels`;
    toggleBtn.textContent = (panel.style.display !== 'none' ? '✕ ' : '☰ ') + label;
    countEl.textContent   = label;
  }

  if (panel.style.display === 'none') return;
  cards.innerHTML = '';

  const idField    = state.taxdefault.idField || state.ownership.idField;
  const amtField   = state.taxdefault.amountField;
  const ownerField = state.taxdefault.ownerField;
  const acreField  = state.county.acreField;
  const acreConv   = state.county.acreConvFactor;
  const sampleP    = (features[0] || {}).properties || {};
  const addrField  = guessAddressField(Object.keys(sampleP));

  features.forEach(feature => {
    const p      = feature.properties || {};
    const apn    = idField    ? p[idField]    : null;
    const amount = amtField   ? p[amtField]   : null;
    const owner  = ownerField ? p[ownerField] : null;
    const addr   = addrField  ? p[addrField]  : null;

    let acres = null;
    if (acreField && p[acreField] != null) {
      const raw = parseFloat(p[acreField]);
      if (!isNaN(raw)) acres = (raw * acreConv).toFixed(1);
    }

    // Determine satellite fallback URL (needs geometry)
    let satelliteSrc = null;
    if (feature.geometry) {
      const c = getCentroid(feature.geometry);
      if (c) {
        const [lon, lat] = c;
        satelliteSrc = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lon.toFixed(6)},${lat.toFixed(6)},16/380x160?access_token=${MAPBOX_PUBLIC_TOKEN}`;
      }
    }

    // Street View preview URL — only when API key present and address is real
    const hasAddr = addr && isRealStreetAddress(addr);
    let streetViewSrc = null;
    if (hasAddr && GOOGLE_MAPS_KEY) {
      streetViewSrc = `https://maps.googleapis.com/maps/api/streetview?size=380x160&location=${encodeURIComponent(addr.trim())}&return_error_code=true&key=${GOOGLE_MAPS_KEY}`;
    }

    // Primary image: Street View if available, else satellite, else placeholder
    const primarySrc = streetViewSrc || satelliteSrc;
    let imgHtml;
    if (primarySrc) {
      // data-src for lazy loading; data-fallback for Street View → satellite fallback
      const fallbackAttr = streetViewSrc && satelliteSrc ? ` data-fallback="${satelliteSrc}"` : '';
      imgHtml = `<img data-src="${primarySrc}"${fallbackAttr} alt="" class="card-img lazy-img">`;
    } else {
      imgHtml = `<div class="card-img-placeholder">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/></svg></div>`;
    }

    // Google Maps link badge / "not available" label
    let svHtml = `<span class="card-sv-na">Street View not available</span>`;
    if (hasAddr) {
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(addr.trim())}`;
      svHtml = `<a href="${mapsUrl}" target="_blank" rel="noopener" class="card-sv-badge">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        View on Google Maps</a>`;
    }

    const card = document.createElement('div');
    card.className = 'parcel-card';
    card.innerHTML = `
      <div class="card-image-wrap">
        ${imgHtml}
        ${svHtml}
      </div>
      <div class="card-body">
        ${amount ? `<div class="card-price">${formatCurrency(amount)}</div>` : ''}
        <div class="card-apn">${apn || '—'}</div>
        ${addr  ? `<div class="card-meta">${addr}</div>`  : ''}
        ${owner ? `<div class="card-meta">${owner}</div>` : ''}
        ${acres ? `<div class="card-meta">${acres} ac</div>` : ''}
      </div>`;

    card.addEventListener('click', e => {
      if (e.target.closest('.card-sv-badge')) return;

      // Highlight & zoom on the map
      highlightParcelOnMap(feature);

      // Visual selection state on cards
      cards.querySelectorAll('.parcel-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    cards.appendChild(card);
  });

  initLazyImages(cards);
}

// Lazy-load .lazy-img elements inside a container using IntersectionObserver.
// Images with data-fallback will fall back to that src on load error (e.g. no Street View).
function initLazyImages(container) {
  const imgs = container.querySelectorAll('.lazy-img');
  if (!imgs.length) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback for old browsers: load everything immediately
    imgs.forEach(img => { img.src = img.dataset.src; });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      obs.unobserve(img);
      img.onerror = () => {
        if (img.dataset.fallback) {
          img.src = img.dataset.fallback;
          img.removeAttribute('data-fallback');
        }
      };
      img.src = img.dataset.src;
    });
  }, {
    root: container,   // observe within the scrollable panel
    rootMargin: '120px', // start loading slightly before scrolling into view
  });

  imgs.forEach(img => observer.observe(img));
}

function setListViewOpen(open) {
  const panel = document.getElementById('parcel-list-panel');
  panel.style.display = open ? 'flex' : 'none';
  setTimeout(() => map.invalidateSize(), 50);
  if (open) {
    refreshListView();
  } else {
    // Clear selection when panel closes
    if (state.highlightLayer) { map.removeLayer(state.highlightLayer); state.highlightLayer = null; }
    state.selectedAin = null;
    if (state.county.isMapbox && state.county.layer) state.county.layer.redraw();
    renderParcelListView([], null); // update button label only
  }
}

document.getElementById('btn-list-view').addEventListener('click', () => {
  setListViewOpen(document.getElementById('parcel-list-panel').style.display === 'none');
});
document.getElementById('btn-close-list').addEventListener('click', () => setListViewOpen(false));
document.getElementById('list-search').addEventListener('input', refreshListView);

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportMatchedCSV() {
  if (!state.matched.length) return;

  // Collect all unique keys
  const allKeys = new Set();
  state.matched.forEach(f => Object.keys(f.properties || {}).forEach(k => allKeys.add(k)));

  const headers = Array.from(allKeys).filter(k => !k.startsWith('_'));
  headers.unshift('_matchType'); // Put match type first

  const rows = state.matched.map(f => {
    const props = f.properties || {};
    return headers.map(h => {
      const v = props[h];
      if (v == null) return '';
      const s = String(v);
      // Escape CSV
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadText(csv, 'tax_defaults_in_conservation_areas.csv', 'text/csv');
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Badge/State Helpers ──────────────────────────────────────────────────────

function updateBadge(layer, count) {
  const badge = document.getElementById(`badge-${layer}`);
  badge.textContent = count > 0 ? `${count.toLocaleString()} parcels` : 'Not loaded';
  badge.className = 'badge' + (count > 0 ? ' loaded' : '');
}

function checkRunMatchEnabled() {
  const canRun = state.conservation.geojson && state.taxdefault.geojson;
  const btn = document.getElementById('btn-run-match');
  btn.disabled = !canRun;
  if (canRun) {
    btn.classList.add('btn-pulse');
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    btn.classList.remove('btn-pulse');
  }
}

function showNoGeomNotice(layerType, hasGeom) {
  const notice   = document.getElementById(`${layerType}-no-geom-notice`);
  const controls = document.getElementById(`${layerType}-controls`);
  if (notice)   notice.style.display   = hasGeom ? 'none' : 'flex';
  if (controls) controls.style.display = hasGeom ? 'flex' : 'none';
}

// ─── Layer Load Handler ───────────────────────────────────────────────────────

// ─── Cloud Tax Default Loading ────────────────────────────────────────────────

// Parse a CSV string (same column detection as parseCSV) → GeoJSON
function csvTextToGeoJSON(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        if (!results.data || results.data.length === 0) {
          reject(new Error('CSV is empty or could not be parsed.')); return;
        }
        const fields  = results.meta.fields || [];
        const latField = fields.find(f => /^lat(itude)?$/i.test(f));
        const lngField = fields.find(f => /^lon(g(itude)?)?$|^lng$/i.test(f));
        const wktField = fields.find(f => /wkt|geometry|geom/i.test(f));
        let features;
        if (latField && lngField) {
          features = results.data.filter(r => r[latField] && r[lngField]).map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [parseFloat(r[lngField]), parseFloat(r[latField])] },
            properties: r,
          }));
        } else if (wktField) {
          features = results.data.filter(r => r[wktField]).map(r => ({
            type: 'Feature', geometry: parseWKT(r[wktField]), properties: r,
          })).filter(f => f.geometry !== null);
        } else {
          features = results.data.map(r => ({ type: 'Feature', geometry: null, properties: r }));
        }
        resolve({ type: 'FeatureCollection', features });
      },
      error: err => reject(new Error('CSV parse error: ' + err.message)),
    });
  });
}

// Parse an Excel ArrayBuffer → GeoJSON
function excelBufferToGeoJSON(buffer) {
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'array' }); }
  catch (err) { throw new Error('Failed to read Excel file: ' + err.message); }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file contains no sheets.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new Error('Excel sheet is empty.');
  const fields  = Object.keys(rows[0]);
  const latField = fields.find(f => /^lat(itude)?$/i.test(f));
  const lngField = fields.find(f => /^lon(g(itude)?)?$|^lng$/i.test(f));
  const wktField = fields.find(f => /wkt|geometry|geom/i.test(f));
  let features;
  if (latField && lngField) {
    features = rows.filter(r => r[latField] !== '' && r[lngField] !== '').map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(r[lngField]), parseFloat(r[latField])] },
      properties: r,
    }));
  } else if (wktField) {
    features = rows.filter(r => r[wktField]).map(r => ({
      type: 'Feature', geometry: parseWKT(String(r[wktField])), properties: r,
    })).filter(f => f.geometry !== null);
  } else {
    features = rows.map(r => ({ type: 'Feature', geometry: null, properties: r }));
  }
  return { type: 'FeatureCollection', features };
}

// Fetch + parse any supported format from a URL (CSV, XLSX, GeoJSON, or ZIP shapefile)
async function parseFromURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status + ' fetching ' + url);
  const ext = url.toLowerCase().split('?')[0].replace(/.*\./, '');
  if (ext === 'csv') {
    return csvTextToGeoJSON(await response.text());
  } else if (ext === 'xlsx' || ext === 'xls') {
    return excelBufferToGeoJSON(await response.arrayBuffer());
  } else if (ext === 'geojson' || ext === 'json') {
    const gj = await response.json();
    return gj.type === 'Feature' ? { type: 'FeatureCollection', features: [gj] } : gj;
  } else if (ext === 'zip') {
    const gj = await shp(await response.arrayBuffer());
    return Array.isArray(gj)
      ? { type: 'FeatureCollection', features: gj.flatMap(fc => fc.features || []) }
      : gj;
  }
  throw new Error('Unsupported format: .' + ext + '. Use .csv, .xlsx, .geojson, or .zip.');
}

// Auto-load a county's tax default list from a hosted URL, then surface it in the UI.
async function loadTaxDefaultFromURL(url) {
  showLoading('Loading tax default list from cloud\u2026');
  try {
    const geojson = await parseFromURL(url);
    applyTaxDefaultData(geojson, /* skipZoom= */ true);
    // Mark the drop zone as cloud-synced so CSS can show the badge
    document.getElementById('drop-taxdefault').setAttribute('data-cloud-loaded', 'true');
    document.getElementById('taxdefault-cloud-notice').style.display = 'flex';
    checkRunMatchEnabled();
  } catch (err) {
    // Non-fatal — user can still upload manually
    console.warn('Auto-load tax default failed:', err.message);
  } finally {
    hideLoading();
  }
}

// Shared helper — apply a parsed tax-default GeoJSON to state and the map.
// Called by both the manual file upload path and the auto-load-from-URL path.
// skipZoom=true when the county auto-loads this data (county zoom already set).
function applyTaxDefaultData(geojson, skipZoom = false) {
  const fields  = getFields(geojson);
  const count   = (geojson.features || []).length;
  const hasGeom = (geojson.features || []).some(f => f.geometry);

  state.taxdefault.geojson     = geojson;
  state.taxdefault.fields      = fields;
  state.taxdefault.idField     = guessIdField(fields);
  state.taxdefault.amountField = guessAmountField(fields);
  state.taxdefault.ownerField  = guessOwnerField(fields);

  // Build AIN lookup set for Mapbox vector tile highlighting
  const idF = state.taxdefault.idField;
  state.taxdefault.ainSet = new Set(
    (geojson.features || []).map(f => normalizeId((f.properties || {})[idF])).filter(Boolean)
  );
  // If county is a Mapbox vector tile layer, redraw to highlight tax default parcels
  if (state.county.isMapbox && state.county.layer) {
    state.county.layer.redraw();
  }

  populateFieldSelect('taxdefault-id-field', fields, state.taxdefault.idField);
  populateOptionalFieldSelect('taxdefault-amount-field', fields, state.taxdefault.amountField);
  populateOptionalFieldSelect('taxdefault-owner-field', fields, state.taxdefault.ownerField);

  document.getElementById('taxdefault-field-map').style.display = 'block';
  document.getElementById('drop-taxdefault').classList.add('loaded');
  showNoGeomNotice('taxdefault', hasGeom);

  addTaxDefaultLayer(geojson);
  updateBadge('taxdefault', count);

  if (!skipZoom && state.taxdefault.layer) {
    try { map.fitBounds(state.taxdefault.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }

  // Populate list view automatically (also shows the List button)
  refreshListView();
}

async function handleLayerLoad(file, layerType) {
  const labels = { county: 'County Shapefile', ownership: 'Ownership', taxdefault: 'Tax Default' };
  showLoading(`Loading ${labels[layerType] || layerType}...`);

  try {
    const geojson = await parseFile(file);
    const fields  = getFields(geojson);
    const count   = (geojson.features || []).length;
    const hasGeom = (geojson.features || []).some(f => f.geometry);

    if (layerType === 'county') {
      state.county.geojson  = geojson;
      state.county.fields   = fields;
      state.county.idField  = guessIdField(fields);

      populateFieldSelect('county-id-field', fields, state.county.idField);
      document.getElementById('county-field-map').style.display = 'block';
      document.getElementById('county-controls').style.display  = 'flex';
      document.getElementById('drop-county').classList.add('loaded');

      addCountyLayer(geojson);
      updateBadge('county', count);

      if (state.county.layer) {
        try { map.fitBounds(state.county.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
      }

      // Rebuild ownership/taxdefault layers that were waiting for county geometry
      const owHasGeom = state.ownership.geojson &&
        (state.ownership.geojson.features || []).some(f => f.geometry);
      if (state.ownership.geojson && !owHasGeom) buildLayerFromCounty('ownership');

      const tdHasGeom = state.taxdefault.geojson &&
        (state.taxdefault.geojson.features || []).some(f => f.geometry);
      if (state.taxdefault.geojson && !tdHasGeom) {
        if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
      }

    } else if (layerType === 'conservation') {
      state.conservation.geojson    = geojson;
      state.conservation.fields     = fields;
      state.conservation.nameField  = fields.find(f =>
        /name|title|label|area|unit|property/i.test(f)
      ) || null;

      populateOptionalFieldSelect('conservation-name-field', fields, state.conservation.nameField);
      document.getElementById('conservation-field-map').style.display = 'block';
      document.getElementById('conservation-controls').style.display  = 'flex';
      document.getElementById('drop-conservation').classList.add('loaded');

      addConservationLayer(geojson);
      updateBadge('conservation', count);

      if (state.conservation.layer) {
        try { map.fitBounds(state.conservation.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
      }

    } else if (layerType === 'ownership') {
      state.ownership.geojson  = geojson;
      state.ownership.fields   = fields;
      state.ownership.idField  = guessIdField(fields);

      populateFieldSelect('ownership-id-field', fields, state.ownership.idField);
      document.getElementById('ownership-field-map').style.display = 'block';
      document.getElementById('drop-ownership').classList.add('loaded');
      showNoGeomNotice('ownership', hasGeom);

      addOwnershipLayer(geojson);
      updateBadge('ownership', count);

      if (state.ownership.layer) {
        try { map.fitBounds(state.ownership.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
      }

      // Rebuild taxdefault preview if it was using ownership geometry
      const tdHasGeom = state.taxdefault.geojson &&
        (state.taxdefault.geojson.features || []).some(f => f.geometry);
      if (state.taxdefault.geojson && !tdHasGeom) {
        if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
      }

    } else { // taxdefault
      applyTaxDefaultData(geojson);
    }

    checkRunMatchEnabled();

  } catch (err) {
    alert('Error loading file: ' + err.message);
    console.error(err);
  } finally {
    hideLoading();
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

// File inputs for all four layers
['county', 'ownership', 'conservation', 'taxdefault'].forEach(layerType => {
  const fileInput = document.getElementById(`file-${layerType}`);
  const dropZone  = document.getElementById(`drop-${layerType}`);

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleLayerLoad(e.target.files[0], layerType);
    e.target.value = '';
  });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleLayerLoad(file, layerType);
  });
});

// County state selector — re-render county grid
document.getElementById('county-state-select').addEventListener('change', () => {
  renderCountyGrid();
});

// Field selectors — update state and rebuild visual layers
document.getElementById('county-id-field').addEventListener('change', e => {
  state.county.idField = e.target.value;
  // Rebuild any attribute-only layers that need county geometry
  const owHasGeom = state.ownership.geojson &&
    (state.ownership.geojson.features || []).some(f => f.geometry);
  if (state.ownership.geojson && !owHasGeom) buildLayerFromCounty('ownership');
  const tdHasGeom = state.taxdefault.geojson &&
    (state.taxdefault.geojson.features || []).some(f => f.geometry);
  if (state.taxdefault.geojson && !tdHasGeom) {
    if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
  }
});

document.getElementById('ownership-id-field').addEventListener('change', e => {
  state.ownership.idField = e.target.value;
  const owHasGeom = state.ownership.geojson &&
    (state.ownership.geojson.features || []).some(f => f.geometry);
  if (!owHasGeom) buildLayerFromCounty('ownership');
  const tdHasGeom = state.taxdefault.geojson &&
    (state.taxdefault.geojson.features || []).some(f => f.geometry);
  if (state.taxdefault.geojson && !tdHasGeom) {
    if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
  }
});

document.getElementById('taxdefault-id-field').addEventListener('change', e => {
  state.taxdefault.idField = e.target.value;
  const tdHasGeom = state.taxdefault.geojson &&
    (state.taxdefault.geojson.features || []).some(f => f.geometry);
  if (!tdHasGeom) {
    if (!buildLayerFromCounty('taxdefault')) buildTaxDefaultPreviewFromOwnership();
  }
});

document.getElementById('taxdefault-amount-field').addEventListener('change', e => {
  state.taxdefault.amountField = e.target.value;
});

document.getElementById('taxdefault-owner-field').addEventListener('change', e => {
  state.taxdefault.ownerField = e.target.value;
});

document.getElementById('conservation-name-field').addEventListener('change', e => {
  state.conservation.nameField = e.target.value;
  if (state.conservation.geojson) addConservationLayer(state.conservation.geojson);
});

// Layer visibility toggles
['county', 'ownership', 'conservation', 'taxdefault'].forEach(lt => {
  const toggle = document.getElementById(`toggle-${lt}`);
  if (toggle) toggle.addEventListener('change', e => {
    if (!state[lt].layer) return;
    if (e.target.checked) state[lt].layer.addTo(map);
    else map.removeLayer(state[lt].layer);
  });
});

// Zoom to layer
document.getElementById('btn-zoom-county').addEventListener('click', () => {
  if (state.county.layer) {
    try { map.fitBounds(state.county.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
});
document.getElementById('btn-zoom-ownership').addEventListener('click', () => {
  if (state.ownership.layer) {
    try { map.fitBounds(state.ownership.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
});
document.getElementById('btn-zoom-conservation').addEventListener('click', () => {
  if (state.conservation.layer) {
    try { map.fitBounds(state.conservation.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
});
document.getElementById('btn-zoom-taxdefault').addEventListener('click', () => {
  if (state.taxdefault.layer) {
    try { map.fitBounds(state.taxdefault.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }
});

// Run match
document.getElementById('btn-run-match').addEventListener('click', () => {
  document.getElementById('btn-run-match').classList.remove('btn-pulse');
  runMatchAnalysis();
});

// Results panel
document.getElementById('btn-close-results').addEventListener('click', () => {
  document.getElementById('results-panel').style.display = 'none';
});

document.getElementById('btn-show-results').addEventListener('click', () => {
  document.getElementById('results-panel').style.display = 'flex';
});

document.getElementById('results-search').addEventListener('input', e => {
  renderResultsList(state.matched, e.target.value);
});

document.getElementById('results-sort').addEventListener('change', () => {
  renderResultsList(state.matched, document.getElementById('results-search').value);
});

// ─── Filter bar pill logic ────────────────────────────────────────────────────

function getSearchText() {
  return document.getElementById('results-search').value;
}

function updateFilterPills() {
  // Bid pills
  document.querySelectorAll('.fpill-option[data-max-bid]').forEach(btn => {
    const val = btn.dataset.maxBid ? Number(btn.dataset.maxBid) : null;
    btn.classList.toggle('active', val === state.filters.maxBid);
  });
  const bidBtn = document.getElementById('bid-fpill-btn');
  bidBtn.classList.toggle('active', state.filters.maxBid !== null);

  // Acres pills
  document.querySelectorAll('.fpill-option[data-max-acres]').forEach(btn => {
    const val = btn.dataset.maxAcres ? Number(btn.dataset.maxAcres) : null;
    btn.classList.toggle('active', val === state.filters.maxAcres);
  });
  const acresBtn = document.getElementById('acres-fpill-btn');
  acresBtn.classList.toggle('active', state.filters.maxAcres !== null);

  // Clear-all button
  const anyActive = state.filters.maxBid !== null || state.filters.maxAcres !== null;
  document.getElementById('fbar-clear-all').style.display = anyActive ? 'block' : 'none';
}

function closeFpillMenus() {
  document.querySelectorAll('.fpill-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.fpill-btn').forEach(b => b.removeAttribute('aria-expanded'));
}

function toggleFpillMenu(menuId, btnId) {
  const menu = document.getElementById(menuId);
  const btn  = document.getElementById(btnId);
  const isOpen = menu.classList.contains('open');
  closeFpillMenus();
  if (!isOpen) {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

document.getElementById('bid-fpill-btn').addEventListener('click', e => {
  e.stopPropagation();
  toggleFpillMenu('bid-fpill-menu', 'bid-fpill-btn');
});

document.getElementById('acres-fpill-btn').addEventListener('click', e => {
  e.stopPropagation();
  toggleFpillMenu('acres-fpill-menu', 'acres-fpill-btn');
});

document.querySelectorAll('.fpill-option[data-max-bid]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filters.maxBid = btn.dataset.maxBid ? Number(btn.dataset.maxBid) : null;
    closeFpillMenus();
    updateFilterPills();
    renderResultsList(state.matched, getSearchText());
    refreshListView();
  });
});

document.querySelectorAll('.fpill-option[data-max-acres]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filters.maxAcres = btn.dataset.maxAcres ? Number(btn.dataset.maxAcres) : null;
    closeFpillMenus();
    updateFilterPills();
    renderResultsList(state.matched, getSearchText());
    refreshListView();
  });
});

document.getElementById('fbar-clear-all').addEventListener('click', () => {
  state.filters.maxBid   = null;
  state.filters.maxAcres = null;
  updateFilterPills();
  renderResultsList(state.matched, getSearchText());
  refreshListView();
});

// Close menus when clicking outside
document.addEventListener('click', closeFpillMenus);

// Export
document.getElementById('btn-export').addEventListener('click', exportMatchedCSV);
document.getElementById('btn-export-results').addEventListener('click', exportMatchedCSV);

// Basemap toggle
document.getElementById('btn-basemap-toggle').addEventListener('click', () => {
  state.basemapIdx = (state.basemapIdx + 1) % BASEMAPS.length;
  setBasemap(state.basemapIdx);
});

// Clear all
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!confirm('Clear all loaded data and results?')) return;

  ['county', 'ownership', 'conservation', 'taxdefault'].forEach(lt => {
    if (state[lt].layer) { map.removeLayer(state[lt].layer); state[lt].layer = null; }
    state[lt].geojson = null;
    state[lt].fields  = [];
    state[lt].idField = null;
    document.getElementById(`drop-${lt}`).classList.remove('loaded');
    document.getElementById(`badge-${lt}`).textContent = 'Not loaded';
    document.getElementById(`badge-${lt}`).className = 'badge';
    document.getElementById(`${lt}-field-map`).style.display  = 'none';
    document.getElementById(`${lt}-controls`).style.display   = 'none';
    const notice = document.getElementById(`${lt}-no-geom-notice`);
    if (notice) notice.style.display = 'none';
  });

  state.taxdefault.amountField = null;
  state.taxdefault.ownerField  = null;

  if (state.county.boundaryLayer) { map.removeLayer(state.county.boundaryLayer); state.county.boundaryLayer = null; }
  state.county.isMapbox = false;

  if (state.matchedLayer) { map.removeLayer(state.matchedLayer); state.matchedLayer = null; }
  state.matched = [];

  document.getElementById('results-panel').style.display = 'none';
  document.getElementById('btn-show-results').style.display = 'none';
  document.getElementById('btn-export').disabled = true;
  document.getElementById('btn-run-match').disabled = true;
  document.getElementById('match-status').textContent = '';
  document.getElementById('match-status').className = 'match-status';

  renderCountyGrid(); // clear active county highlight
});

// Modal close
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').style.display = 'none';
});
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').style.display = 'none';
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay').style.display = 'none';
  }
});

// ─── Mobile Navigation ────────────────────────────────────────────────────────

function isMobile() { return window.innerWidth <= 640; }

window.setMobileTab = function(tab) {
  if (!isMobile()) return;

  const sidebar   = document.querySelector('.sidebar');
  const mapContainer = document.querySelector('.map-container');
  const resultsPanel = document.getElementById('results-panel');
  const btns      = document.querySelectorAll('.mobile-nav-btn');

  // Update active button
  btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  // Setup tab — show sidebar overlay, hide results
  if (tab === 'setup') {
    sidebar.classList.add('mobile-open');
    if (resultsPanel.style.display !== 'none') resultsPanel.style.display = 'none';
  }

  // Map tab — hide sidebar, hide results panel
  if (tab === 'map') {
    sidebar.classList.remove('mobile-open');
    resultsPanel.style.display = 'none';
    // Trigger Leaflet resize since the map container may have changed size
    setTimeout(() => map.invalidateSize(), 50);
  }

  // Results tab — hide sidebar, show results panel
  if (tab === 'results') {
    sidebar.classList.remove('mobile-open');
    if (state.matched.length) {
      resultsPanel.style.display = 'flex';
    }
  }
};

// Auto-switch to Map tab when county loads
function mobileGoToMap() {
  if (isMobile()) setMobileTab('map');
}

// Auto-switch to Results tab and update badge when analysis completes
function mobileShowResults(count) {
  if (!isMobile()) return;
  const badge = document.getElementById('mobile-results-badge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
    setMobileTab('results');
  } else {
    badge.style.display = 'none';
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────
renderCountyGrid();
