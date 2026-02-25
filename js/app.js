/* ============================================================
   Tax Default Parcel Mapper — Main Application
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  county: {
    geojson:   null,   // full county parcel fabric — geometry source
    layer:     null,
    idField:   null,
    fields:    [],
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
};

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

function showLoading(msg = 'Processing...') {
  document.getElementById('loading-overlay').style.display = 'flex';
  document.getElementById('loading-msg').textContent = msg;
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
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

  const layer = L.geoJSON({ ...geojson, features: validFeatures }, {
    style: () => ({ ...STYLE_COUNTY }),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { radius: 3, ...STYLE_COUNTY }),
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
  const matched = countyFeatures.filter(f => {
    const id = normalizeId((f.properties || {})[state.county.idField]);
    return id && targetIds.has(id);
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

  const matched = (owGJ.features || []).filter(f => {
    const id = normalizeId((f.properties || {})[state.ownership.idField]);
    return id && tdIds.has(id);
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
        const props = feature.properties || {};
        const idField = state.taxdefault.idField || state.ownership.idField;
        const apn = idField ? props[idField] : '—';
        const amount = state.taxdefault.amountField ? props[state.taxdefault.amountField] : null;
        const owner = state.taxdefault.ownerField ? props[state.taxdefault.ownerField] : null;

        const amountDisplay = amount
          ? `<div class="popup-amount">
               <span class="popup-amount-label">Tax Default Amount</span>
               <span class="popup-amount-value">${formatCurrency(amount)}</span>
             </div>`
          : '';

        const popupContent = `
          <div class="popup-title">${apn || 'Parcel'}</div>
          ${owner ? `<div class="popup-row"><span class="popup-label">Owner</span><span class="popup-value">${owner}</span></div>` : ''}
          ${amountDisplay}
          <span class="popup-tag">${props._matchType || 'Matched'}</span>
          <button class="popup-btn" onclick="showParcelModalById('${apn}')">View full details →</button>
        `;
        featureLayer.bindPopup(popupContent, { maxWidth: 260 });
      },
    }
  );

  layer.addTo(map);
  state.matchedLayer = layer;
}

// ─── Match Logic ─────────────────────────────────────────────────────────────

function runMatchAnalysis() {
  const matchById       = document.getElementById('match-by-id').checked;
  const matchByTouching = document.getElementById('match-by-touching').checked;

  if (!matchById && !matchByTouching) {
    setMatchStatus('Select at least one match method.', 'error');
    return;
  }

  const ownershipGJ  = state.ownership.geojson;
  const taxdefaultGJ = state.taxdefault.geojson;

  if (!ownershipGJ || !taxdefaultGJ) {
    setMatchStatus('Both layers must be loaded before running match.', 'error');
    return;
  }

  showLoading('Running match analysis...');

  // Use setTimeout to allow loading indicator to render
  setTimeout(() => {
    try {
      const results = [];
      const seenIds = new Set();

      const ownershipFeatures  = ownershipGJ.features  || [];
      const taxdefaultFeatures = taxdefaultGJ.features || [];

      // Build county lookup for geometry fallback
      const countyById = new Map();
      if (state.county.geojson && state.county.idField) {
        (state.county.geojson.features || []).forEach(f => {
          const id = normalizeId((f.properties || {})[state.county.idField]);
          if (id && f.geometry) countyById.set(id, f);
        });
      }

      // --- ID-based matching ---
      if (matchById && state.ownership.idField && state.taxdefault.idField) {
        // Build lookup from ownership by normalized ID
        const ownershipById = new Map();
        ownershipFeatures.forEach(f => {
          const raw = (f.properties || {})[state.ownership.idField];
          const id = normalizeId(raw);
          if (id) ownershipById.set(id, f);
        });

        taxdefaultFeatures.forEach(tdFeature => {
          const raw = (tdFeature.properties || {})[state.taxdefault.idField];
          const id = normalizeId(raw);
          if (!id) return;

          const owFeature = ownershipById.get(id);

          // Use ownership geometry if available (more detailed), else taxdefault
          // Geometry priority: ownership → taxdefault → county shapefile
          let geom = (owFeature && owFeature.geometry) ? owFeature.geometry
                   : tdFeature.geometry || null;
          if (!geom && countyById.size) {
            const cf = countyById.get(id);
            if (cf) geom = cf.geometry;
          }

          const mergedProps = {
            ...(owFeature ? owFeature.properties : {}),
            ...tdFeature.properties,
            _matchType: 'ID Match',
            _matchedApn: raw,
          };

          if (!seenIds.has(id)) {
            seenIds.add(id);
            results.push({ type: 'Feature', geometry: geom, properties: mergedProps });
          }
        });
      }

      // --- Helper: resolve geometry from the feature itself or county by APN ---
      const resolveGeom = (feature, layerType) => {
        if (feature.geometry) return feature.geometry;
        if (!countyById.size) return null;
        const idField = layerType === 'ownership' ? state.ownership.idField : state.taxdefault.idField;
        if (!idField) return null;
        const id = normalizeId((feature.properties || {})[idField]);
        const cf = id ? countyById.get(id) : null;
        return cf ? cf.geometry : null;
      };

      // Encode a coordinate pair to a lookup key (6 dp ≈ 0.1 m precision)
      const coord2key = (x, y) => `${x.toFixed(6)},${y.toFixed(6)}`;

      // --- Touching / Adjacent matching ---
      // Find all tax-default parcels that share at least one boundary vertex
      // with any of the user's ownership parcels.
      if (matchByTouching) {
        // Build a set of every boundary coordinate from every ownership parcel
        const owBoundaryCoords = new Set();
        ownershipFeatures.forEach(f => {
          const geom = resolveGeom(f, 'ownership');
          if (!geom) return;
          getAllCoords(geom).forEach(([x, y]) => owBoundaryCoords.add(coord2key(x, y)));
        });

        if (owBoundaryCoords.size) {
          taxdefaultFeatures.forEach(tdFeature => {
            const tdIdField = state.taxdefault.idField;
            const tdId = tdIdField
              ? normalizeId((tdFeature.properties || {})[tdIdField])
              : null;

            // Skip if already captured by ID match
            if (tdId && seenIds.has(tdId)) return;

            const geom = resolveGeom(tdFeature, 'taxdefault');
            if (!geom) return;

            // Check if this parcel shares any boundary coord with our ownership
            const tdCoords = getAllCoords(geom);
            const touches  = tdCoords.some(([x, y]) => owBoundaryCoords.has(coord2key(x, y)));
            if (!touches) return;

            if (tdId) seenIds.add(tdId);

            // Pull extra county context if available
            const countyFeature = (tdId && countyById.size) ? countyById.get(tdId) : null;
            const mergedProps = {
              ...(countyFeature ? countyFeature.properties : {}),
              ...tdFeature.properties,
              _matchType: 'Adjacent / Touching',
              _matchedApn: tdId || '',
            };
            results.push({ type: 'Feature', geometry: geom, properties: mergedProps });
          });
        }
      }

      state.matched = results;
      addMatchedLayer(results);
      renderResultsList(results);
      updateMatchStatus(results.length);
      hideLoading();

    } catch (err) {
      hideLoading();
      setMatchStatus('Error during match: ' + err.message, 'error');
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

  countEl.textContent    = features.length;
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

  // Filter
  const filterLower = filter.toLowerCase();
  const visible = filterLower
    ? sorted.filter(f => JSON.stringify(f.properties).toLowerCase().includes(filterLower))
    : sorted;

  list.innerHTML = '';
  visible.forEach(feature => {
    const props = feature.properties || {};
    const idField    = state.taxdefault.idField || state.ownership.idField;
    const amtField   = state.taxdefault.amountField;
    const ownerField = state.taxdefault.ownerField;

    const apn    = idField    ? props[idField]    : null;
    const amount = amtField   ? props[amtField]   : null;
    const owner  = ownerField ? props[ownerField] : null;

    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-item-header">
        <span class="result-apn">${apn || '—'}</span>
        ${amount ? `<span class="result-amount">${formatCurrency(amount)}</span>` : ''}
      </div>
      ${owner ? `<div class="result-owner">${owner}</div>` : ''}
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

  // Total amount
  if (state.taxdefault.amountField) {
    const total = features.reduce((sum, f) => {
      const v = parseFloat(String((f.properties || {})[state.taxdefault.amountField]).replace(/[^\d.]/g, ''));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    summary.textContent = `Total: ${formatCurrency(total)}`;
  } else {
    summary.textContent = `${features.length} parcels`;
  }
}

function updateMatchStatus(count) {
  if (count === 0) {
    setMatchStatus('No matches found. Try adjusting fields or match options.', 'warning');
    return;
  }
  const results  = state.matched;
  const nId      = results.filter(f => (f.properties || {})._matchType === 'ID Match').length;
  const nTouch   = results.filter(f => (f.properties || {})._matchType === 'Adjacent / Touching').length;
  const parts    = [];
  if (nId)    parts.push(`${nId} owned`);
  if (nTouch) parts.push(`${nTouch} touching`);
  const detail   = parts.length ? ` (${parts.join(', ')})` : '';
  setMatchStatus(`Found ${count} parcel${count !== 1 ? 's' : ''}${detail} — see results panel.`, 'success');
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
  downloadText(csv, 'tax_default_matched_parcels.csv', 'text/csv');
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
  const canRun = state.ownership.geojson && state.taxdefault.geojson;
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
      state.taxdefault.geojson     = geojson;
      state.taxdefault.fields      = fields;
      state.taxdefault.idField     = guessIdField(fields);
      state.taxdefault.amountField = guessAmountField(fields);
      state.taxdefault.ownerField  = guessOwnerField(fields);

      populateFieldSelect('taxdefault-id-field', fields, state.taxdefault.idField);
      populateOptionalFieldSelect('taxdefault-amount-field', fields, state.taxdefault.amountField);
      populateOptionalFieldSelect('taxdefault-owner-field', fields, state.taxdefault.ownerField);

      document.getElementById('taxdefault-field-map').style.display = 'block';
      document.getElementById('drop-taxdefault').classList.add('loaded');
      showNoGeomNotice('taxdefault', hasGeom);

      addTaxDefaultLayer(geojson);
      updateBadge('taxdefault', count);

      if (state.taxdefault.layer) {
        try { map.fitBounds(state.taxdefault.layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
      }
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

  if (state.matchedLayer) { map.removeLayer(state.matchedLayer); state.matchedLayer = null; }
  state.matched = [];

  document.getElementById('results-panel').style.display = 'none';
  document.getElementById('btn-show-results').style.display = 'none';
  document.getElementById('btn-export').disabled = true;
  document.getElementById('btn-run-match').disabled = true;
  document.getElementById('match-status').textContent = '';
  document.getElementById('match-status').className = 'match-status';
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
