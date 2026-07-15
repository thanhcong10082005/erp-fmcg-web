/**
 * VietmapMap — Map component using maplibre-gl (ESM) + VietMap style tiles.
 *
 * APPROACH:
 *   VietMap GL JS 6.0.1 CDN bundle is a UMD/IIFE that re-declares the global `Map`
 *   class internally, causing "Cannot access 'a' before initialization" when the
 *   Map() constructor is first invoked (TDZ bug in the minified UMD bundle).
 *
 *   SOLUTION: Use maplibre-gl from npm (ESM, no UMD pollution) as the map engine,
 *   and point it at VietMap's tile/style server. MapLibre GL is the upstream open-source
 *   fork of mapbox-gl 1.x — identical API to VietMap GL JS, fully compatible with
 *   VietMap's style JSON and tile endpoints.
 *
 * WHY MAPLIBRE-GL (not react-map-gl or direct VietMap GL JS):
 *   - maplibre-gl is ESM → no global `Map` collision, no TDZ bug
 *   - 100% API-compatible with mapbox-gl / vietmap-gl 1.x
 *   - Can use VietMap style JSON directly
 *   - Smaller bundle than loading via CDN
 *
 * Features:
 *   - Phase 5: Data-rich pins (🏪/📦/stop_number icons, weight-based sizing)
 *   - Phase 4: Popup assign UI
 *   - Phase 3: Route line (LineString) between delivery stops
 *   - Draggable pins for geocoding
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Tile / Style config ───────────────────────────────────────────
const VIETMAP_TILE_KEY  = import.meta.env.VITE_VIETMAP_TILE_API_KEY || '';
const VIETMAP_STYLE_URL = import.meta.env.VITE_VIETMAP_STYLE_URL     || '';
const MAP_STYLE_URL     = import.meta.env.VITE_MAP_STYLE_URL          || '';

function resolveStyle() {
  if (MAP_STYLE_URL) {
    // Allow custom style (e.g. OSM or any MapLibre-compatible style JSON)
    return MAP_STYLE_URL;
  }
  if (VIETMAP_TILE_KEY) {
    // VietMap style JSON with tile key
    if (VIETMAP_STYLE_URL) {
      return `${VIETMAP_STYLE_URL}${VIETMAP_STYLE_URL.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(VIETMAP_TILE_KEY)}`;
    }
    return `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${encodeURIComponent(VIETMAP_TILE_KEY)}`;
  }
  // Fallback: OpenFreeMap (OSM-based, free, no key needed)
  // eslint-disable-next-line no-console
  console.info('[VietmapMap] No tile key — using OpenFreeMap (OSM) tiles.');
  return 'https://tiles.openfreemap.org/styles/liberty';
}

const RESOLVED_STYLE = resolveStyle();

// eslint-disable-next-line no-console
console.info('[VietmapMap] Tile style:', RESOLVED_STYLE);

// ── Build marker DOM element ──────────────────────────────────────
function buildMarkerEl(point) {
  const el = document.createElement('div');
  el.className = 'vietmap-pin';
  el.style.cssText = 'position:relative;cursor:pointer;';

  const isAssigned = !!(point.metadata?.trip_id);
  const stopOrder  = point.metadata?.stop_order;
  const weight     = point.metadata?.total_weight;
  const baseColor  = point.color || '#3B82F6';

  let size = 18;
  let label = '🏪';
  let fontSize = 10;
  let pulse = '';

  if (isAssigned && stopOrder) {
    size = 32;
    label = String(stopOrder);
    fontSize = 13;
    pulse = `<div style="
      position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;
      border:2px solid ${baseColor};border-radius:50%;opacity:0.35;
      animation:vietmap-pulse 2s infinite;
    "></div>`;
  } else if (typeof weight === 'number' && weight > 0) {
    if (weight >= 500)      { size = 28; label = '📦'; fontSize = 14; }
    else if (weight >= 200) { size = 24; label = '📦'; fontSize = 12; }
    else if (weight >= 100) { size = 20; label = '🏪'; fontSize = 10; }
  }

  const bgColor = (isAssigned && stopOrder) ? baseColor : '#9CA3AF';

  el.innerHTML = `
    <div style="
      width:${size}px;height:${size}px;
      background:${bgColor};
      border:2.5px solid #fff;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:${fontSize}px;font-weight:700;color:#fff;
      box-shadow:0 3px 10px rgba(0,0,0,0.35);
      font-family:system-ui,-apple-system,sans-serif;
      position:relative;z-index:1;
    " title="${point.label || ''}${isAssigned && stopOrder ? ` — Stop #${stopOrder}` : ''}">
      ${label}
    </div>
    ${pulse}
  `;

  return el;
}

// ── Build popup HTML ───────────────────────────────────────────────
function buildPopupHTML(point, tripOptions, selectedTripId, assignLoading) {
  const partner = point.metadata || {};
  const weight = partner.total_weight
    ? `${Number(partner.total_weight).toLocaleString('vi-VN')} kg`
    : '—';
  const stopNum = partner.stop_order ? `Số thứ tự: ${partner.stop_order}` : '';
  const currentTrip = partner.trip_id
    ? `<span style="color:#2563EB">✓ Thuộc chuyến #${partner.trip_id}</span>`
    : '<span style="color:#6B7280">Chưa gán chuyến</span>';

  const tripOptsHTML = tripOptions
    .map(t => `<option value="${t.trip_id}" ${String(selectedTripId) === String(t.trip_id) ? 'selected' : ''}>${t.trip_number || t.trip_id}</option>`)
    .join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-width:240px;max-width:300px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:14px;color:#111827;">${point.label || 'Khách hàng'}</strong>
      </div>
      <div style="font-size:12px;color:#374151;margin-bottom:4px;">
        <div>📦 Khối lượng: <strong>${weight}</strong></div>
        ${stopNum ? `<div style="margin-top:2px;">🔢 ${stopNum}</div>` : ''}
        <div style="margin-top:4px;">${currentTrip}</div>
      </div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #E5E7EB;">
        <label style="font-size:12px;font-weight:600;color:#374151;">Chuyến xe:</label>
        <select id="vietmap-popup-trip-select"
          style="width:100%;margin-top:4px;padding:4px 8px;border:1px solid #D1D5DB;border-radius:4px;font-size:13px;box-sizing:border-box;">
          <option value="">— Chọn chuyến —</option>
          ${tripOptsHTML}
        </select>
        <button id="vietmap-popup-assign-btn"
          style="width:100%;margin-top:6px;padding:6px 12px;background:#2563EB;color:#fff;border:none;border-radius:4px;
                 font-size:13px;cursor:pointer;font-weight:600;opacity:${assignLoading ? '0.7' : '1'};">
          ${assignLoading ? '⏳ Đang lưu...' : '✅ Gán đơn'}
        </button>
      </div>
    </div>
  `;
}

// ── Main component ────────────────────────────────────────────────
export default function VietmapMap({
  points = [],
  center = { lat: 10.762622, lng: 106.660172 },
  zoom = 11,
  height = '500px',
  onPointClick,
  fitBounds = true,
  draggable = false,
  onLocationChange,
  // Phase 3: Route
  routeGeometry = null,
  routeColor = '#2563EB',
  routeWidth = 3,
  routeOpacity = 0.8,
  // Phase 4: Popup assign
  selectedPoint = null,
  onAssignRequest,
  tripOptions = [],
  selectedTripIdForAssign = '',
  onSelectTripForAssign,
  onConfirmAssign,
  assignLoading = false,
  onMapReady,
  forceRender = 0,
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef    = useRef(new Map()); // id → Marker instance
  const popupRef      = useRef(null);
  const initFlag      = useRef(false);
  const prevForceRef  = useRef(forceRender);
  const prevSelectedRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);

  // ── Init map on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     RESOLVED_STYLE,
      center:    [center.lng, center.lat],
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
      if (onMapReady) {
        try { onMapReady(map); } catch (_) { /* ignore */ }
      }
    });

    map.on('error', (e) => {
      const errId = e?.error?.id || '';
      const isTile = ['http', 'tiles', 'socket', 'webgl', 'raster', 'source'].includes(errId);
      if (isTile) {
        // eslint-disable-next-line no-console
        console.warn('[VietmapMap] tile/resource error (non-fatal):', errId);
      } else if (errId) {
        // eslint-disable-next-line no-console
        console.error('[VietmapMap] map error:', errId, e?.error?.message);
      }
    });

    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) { /* ignore */ }
        mapRef.current = null;
      }
      markersRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render markers ─────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || map.isRemoved?.()) return;

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const map_ = markersRef.current;

    // Remove stale markers
    for (const [id, marker] of map_.entries()) {
      if (!valid.some(p => p.id === id)) {
        try { marker.remove?.(); } catch (_) { /* ignore */ }
        map_.delete(id);
      }
    }

    // Update or create markers
    valid.forEach(p => {
      const existing = map_.get(p.id);
      const prevEl   = existing ? existing.getElement?.() : null;
      const prevColor = prevEl?.dataset?.color;
      const prevOrder = prevEl?.dataset?.stopOrder;

      const visualChanged =
        prevColor !== String(p.color || '#3B82F6') ||
        prevOrder !== String(p.metadata?.stop_order ?? '');

      if (existing) {
        let ll;
        try { ll = existing.getLngLat?.(); } catch (_) { ll = null; }
        const posChanged = !ll || Math.abs(ll.lat - p.lat) > 1e-7 || Math.abs(ll.lng - p.lng) > 1e-7;

        if (posChanged && existing.setLngLat) {
          try { existing.setLngLat([p.lng, p.lat]); } catch (_) { /* ignore */ }
        }

        if (visualChanged) {
          try { existing.remove(); } catch (_) { /* ignore */ }
          map_.delete(p.id);
          // Fall through to create new below
        } else {
          return;
        }
      }

      // Create new marker
      try {
        const el = buildMarkerEl(p);
        el.dataset.color    = p.color || '#3B82F6';
        el.dataset.stopOrder = String(p.metadata?.stop_order ?? '');

        const marker = new maplibregl.Marker({ element: el, draggable })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        if (onPointClick) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            try { onPointClick(p); } catch (_) { /* ignore */ }
          });
        }

        if (draggable && onLocationChange) {
          marker.on('dragend', () => {
            try {
              const lngLat = marker.getLngLat();
              onLocationChange({ ...p, lat: lngLat.lat, lng: lngLat.lng });
            } catch (_) { /* ignore */ }
          });
        }

        map_.set(p.id, marker);
      } catch (err) {
        console.error('[VietmapMap] marker creation failed (skipping):', err);
      }
    });
  }, [points, draggable, onPointClick, onLocationChange]);

  // ── Update route layer ─────────────────────────────────────────
  const updateRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const SOURCE = 'planned-route';
    const LAYER  = 'planned-route-layer';
    const OUTL   = 'planned-route-outline';

    if (!routeGeometry || routeGeometry.type !== 'LineString' || !routeGeometry.coordinates?.length) {
      [OUTL, LAYER].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      return;
    }

    const geojson = { type: 'Feature', geometry: routeGeometry, properties: {} };

    if (map.getSource(SOURCE)) {
      try { map.getSource(SOURCE).setData(geojson); } catch (_) { /* ignore */ }
    } else {
      try {
        map.addSource(SOURCE, { type: 'geojson', data: geojson });
        map.addLayer({ id: OUTL, type: 'line', source: SOURCE,
          paint: { 'line-color': '#ffffff', 'line-width': routeWidth + 4, 'line-opacity': routeOpacity * 0.3 },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        });
        map.addLayer({ id: LAYER, type: 'line', source: SOURCE,
          paint: { 'line-color': routeColor, 'line-width': routeWidth, 'line-opacity': routeOpacity },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        });
      } catch (_) { /* ignore */ }
    }
  }, [routeGeometry, routeColor, routeWidth, routeOpacity]);

  // ── Re-render markers + route when points or geometry change ───
  useEffect(() => {
    if (!mapReady) return;
    renderMarkers();
    updateRoute();
  }, [mapReady, points, routeGeometry]);

  // ── Fit bounds on first load ────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !fitBounds || initFlag.current) return;
    const map = mapRef.current;
    if (!map) return;

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (valid.length < 2) return;

    initFlag.current = true;
    let minLng = valid[0].lng, maxLng = valid[0].lng;
    let minLat = valid[0].lat, maxLat = valid[0].lat;
    valid.forEach(p => {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    });
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]],
        { padding: 60, duration: 800, maxZoom: 14 });
    } catch (_) { /* ignore */ }
  }, [mapReady, points, fitBounds]);

  // ── Popup management ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedPoint) {
      if (popupRef.current) {
        try { popupRef.current.remove(); } catch (_) { /* ignore */ }
        popupRef.current = null;
      }
      prevSelectedRef.current = null;
      return;
    }

    if (prevSelectedRef.current?.id === selectedPoint.id) return;
    prevSelectedRef.current = selectedPoint;

    if (popupRef.current) {
      try { popupRef.current.remove(); } catch (_) { /* ignore */ }
      popupRef.current = null;
    }

    try {
      const popupHtml = buildPopupHTML(selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading);

      const popup = new maplibregl.Popup({ closeOnClick: false, maxWidth: '320px' })
        .setLngLat([selectedPoint.lng, selectedPoint.lat])
        .setHTML(popupHtml)
        .addTo(map);

      popupRef.current = popup;

      popup.once('open', () => {
        const selectEl = document.getElementById('vietmap-popup-trip-select');
        if (selectEl && onSelectTripForAssign) {
          selectEl.value = selectedTripIdForAssign || '';
          selectEl.addEventListener('change', (e) => {
            try { onSelectTripForAssign(e.target.value); } catch (_) { /* ignore */ }
          });
        }

        const assignBtn = document.getElementById('vietmap-popup-assign-btn');
        if (assignBtn && onConfirmAssign) {
          assignBtn.addEventListener('click', () => {
            try { onConfirmAssign(); } catch (_) { /* ignore */ }
          });
        }
      });
    } catch (err) {
      console.error('[VietmapMap] popup creation failed:', err);
    }
  }, [selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading, onSelectTripForAssign, onConfirmAssign]);

  // ── Force render fallback ────────────────────────────────────────
  useEffect(() => {
    if (forceRender === prevForceRef.current) return;
    prevForceRef.current = forceRender;
    if (!mapRef.current) return;

    for (const [, m] of markersRef.current.entries()) {
      try { m.remove?.(); } catch (_) { /* ignore */ }
    }
    markersRef.current = new Map();
    renderMarkers();
  }, [forceRender, renderMarkers]);

  // ── Cleanup on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (popupRef.current) {
        try { popupRef.current.remove(); } catch (_) { /* ignore */ }
      }
      for (const [, m] of markersRef.current.entries()) {
        try { m.remove?.(); } catch (_) { /* ignore */ }
      }
      markersRef.current = new Map();
    };
  }, []);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <style>{`
        @keyframes vietmap-pulse {
          0%,100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.15); opacity: 0.15; }
        }
        .vietmap-pin { pointer-events: auto; }
      `}</style>

      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
