/**
 * VietmapMap — Map component using Leaflet (raster tiles) + VietMap / OSM tiles.
 *
 * APPROACH:
 *   Leaflet is the most stable, battle-tested mapping library for React.
 *   It uses raster image tiles (WMS-style) — no GL, no style JSON, no API-key
 *   injection headaches. Works with VietMap's tile server by simply appending
 *   the API key to the tile URL template.
 *
 * WHY LEAFLET (not GL-based libraries):
 *   - Zero GL engine issues (no WebGL context, no shader compilation)
 *   - Tile URLs are plain strings — key injection is just string concatenation
 *   - Works reliably with VietMap, OSM, and any XYZ tile provider
 *   - Lightweight and mature (11k stars, 10+ years stable)
 *
 * Features:
 *   - Phase 5: Data-rich pins (🏪/📦/stop_number icons, weight-based sizing)
 *   - Phase 4: Popup assign UI
 *   - Phase 3: Route line between delivery stops
 *   - Draggable pins for geocoding
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Tile / Style config ───────────────────────────────────────────
const VIETMAP_TILE_KEY = import.meta.env.VITE_VIETMAP_TILE_API_KEY || '';
const VIETMAP_TILE_URL = import.meta.env.VITE_VIETMAP_TILE_URL || '';
const MAP_STYLE_URL    = import.meta.env.VITE_MAP_STYLE_URL || '';
const USE_VIETMAP_TILES = import.meta.env.VITE_USE_VIETMAP_TILES === 'true';

function resolveTileLayer() {
  if (MAP_STYLE_URL) {
    return { urlTemplate: MAP_STYLE_URL, attribution: '', subdomains: '' };
  }

  if (USE_VIETMAP_TILES && VIETMAP_TILE_KEY) {
    if (VIETMAP_TILE_URL) {
      // Custom VietMap tile URL — replace {apikey} placeholder or append
      const url = VIETMAP_TILE_URL.includes('{apikey}')
        ? VIETMAP_TILE_URL.replace('{apikey}', VIETMAP_TILE_KEY)
        : `${VIETMAP_TILE_URL}${VIETMAP_TILE_URL.includes('?') ? '&' : '?'}apikey=${VIETMAP_TILE_KEY}`;
      return { urlTemplate: url, attribution: '© VietMap', subdomains: '' };
    }
    // VietMap v5 raster tile endpoint (street map)
    // Format: /mt/{style}/{z}/{x}/{y}.png?apikey=...
    // Styles: tm=street, lm=light, dm=dark
    const vietmapUrl = `https://maps.vietmap.vn/mt/tm/{z}/{x}/{y}.png?apikey=${VIETMAP_TILE_KEY}`;
    return { urlTemplate: vietmapUrl, attribution: '© VietMap', subdomains: '' };
  }

  // Default: OSM raster tiles — detailed, free, no API key needed, works everywhere
  return {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: '',
  };
}

const TILE_CONFIG = resolveTileLayer();

// eslint-disable-next-line no-console
console.info('[VietmapMap] Tile layer:', TILE_CONFIG.urlTemplate.split('?')[0]);

// ── Build marker DOM element ──────────────────────────────────────
function buildMarkerEl(point) {
  const el = document.createElement('div');
  el.className = 'leaflet-marker-pin';
  el.style.cssText = 'position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;';

  const isAssigned = !!(point.metadata?.trip_id);
  const stopOrder  = point.metadata?.stop_order;
  const weight     = point.metadata?.total_weight;
  const baseColor  = point.color || '#3B82F6';

  let size = 34;
  let label = '🏪';
  let fontSize = 11;
  let pulse = '';

  if (isAssigned && stopOrder) {
    size = 42;
    label = String(stopOrder);
    fontSize = 15;
    pulse = `<div style="
      position:absolute;top:-6px;left:-6px;right:-6px;bottom:-6px;
      border:3px solid ${baseColor};border-radius:50%;opacity:0.3;
      animation:vietmap-pulse 2s infinite;
    "></div>`;
  } else if (typeof weight === 'number' && weight > 0) {
    if (weight >= 500)      { size = 38; label = '📦'; fontSize = 13; }
    else if (weight >= 200) { size = 36; label = '📦'; fontSize = 12; }
    else if (weight >= 100) { size = 34; label = '🏪'; fontSize = 11; }
  }

  const bgColor = (isAssigned && stopOrder) ? baseColor : '#6B7280';

  el.innerHTML = `
    <div style="
      width:${size}px;height:${size}px;
      background:${bgColor};
      border:3px solid #fff;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:${fontSize}px;font-weight:700;color:#fff;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
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
        <select id="leaflet-popup-trip-select"
          style="width:100%;margin-top:4px;padding:4px 8px;border:1px solid #D1D5DB;border-radius:4px;font-size:13px;box-sizing:border-box;">
          <option value="">— Chọn chuyến —</option>
          ${tripOptsHTML}
        </select>
        <button id="leaflet-popup-assign-btn"
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
  routeWidth = 4,
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
  const mapRef      = useRef(null);
  const markersRef  = useRef(new Map()); // id → Marker instance
  const popupRef    = useRef(null);
  const routeRef    = useRef(null);
  const initFlag    = useRef(false);
  const prevForceRef    = useRef(forceRender);
  const prevSelectedRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);

  // ── Init Leaflet map on mount ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
    });

    L.tileLayer(TILE_CONFIG.urlTemplate, {
      attribution: TILE_CONFIG.attribution,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    if (onMapReady) {
      try { onMapReady(map); } catch (_) { /* ignore */ }
    }

    return () => {
      if (popupRef.current) {
        try { popupRef.current.remove(); } catch (_) { /* ignore */ }
        popupRef.current = null;
      }
      for (const [, m] of markersRef.current.entries()) {
        try { m.remove(); } catch (_) { /* ignore */ }
      }
      markersRef.current = new Map();
      try { map.remove(); } catch (_) { /* ignore */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render markers ───────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const map_ = markersRef.current;

    // Remove stale markers
    for (const [id, marker] of map_.entries()) {
      if (!valid.some(p => p.id === id)) {
        try { marker.remove(); } catch (_) { /* ignore */ }
        map_.delete(id);
      }
    }

    // Update or create markers
    valid.forEach(p => {
      const existing = map_.get(p.id);

      if (existing) {
        // Update position if changed
        const prevLatLng = existing.getLatLng();
        if (Math.abs(prevLatLng.lat - p.lat) > 1e-7 || Math.abs(prevLatLng.lng - p.lng) > 1e-7) {
          existing.setLatLng([p.lat, p.lng]);
        }
        return;
      }

      // Create new marker
      try {
        const el = buildMarkerEl(p);

        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            html: el.outerHTML,
            className: '',
            iconSize: null,
            iconAnchor: [16, 16],
          }),
          draggable: !!draggable,
        }).addTo(map);

        if (onPointClick) {
          marker.on('click', (e) => {
            try { onPointClick(p); } catch (_) { /* ignore */ }
          });
        }

        if (draggable && onLocationChange) {
          marker.on('dragend', () => {
            try {
              const latLng = marker.getLatLng();
              onLocationChange({ ...p, lat: latLng.lat, lng: latLng.lng });
            } catch (_) { /* ignore */ }
          });
        }

        map_.set(p.id, marker);
      } catch (err) {
        console.error('[VietmapMap] marker creation failed (skipping):', err);
      }
    });
  }, [points, draggable, onPointClick, onLocationChange]);

  // ── Update route line ────────────────────────────────────────────
  const updateRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old route
    if (routeRef.current) {
      try { routeRef.current.remove(); } catch (_) { /* ignore */ }
      routeRef.current = null;
    }

    if (!routeGeometry || routeGeometry.type !== 'LineString' || !routeGeometry.coordinates?.length) {
      return;
    }

    const coords = routeGeometry.coordinates.map(c => [c[1], c[0]]); // [lng,lat] → [lat,lng]
    if (coords.length < 2) return;

    try {
      const route = L.polyline(coords, {
        color: routeColor,
        weight: routeWidth,
        opacity: routeOpacity,
        smoothFactor: 1,
      }).addTo(map);

      routeRef.current = route;
    } catch (err) {
      console.error('[VietmapMap] route render failed:', err);
    }
  }, [routeGeometry, routeColor, routeWidth, routeOpacity]);

  // ── Re-render markers + route when points or geometry change ─────
  useEffect(() => {
    if (!mapReady) return;
    renderMarkers();
    updateRoute();
  }, [mapReady, points, routeGeometry]);

  // ── Fit bounds on first load ─────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !fitBounds || initFlag.current) return;
    const map = mapRef.current;
    if (!map) return;

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (valid.length < 2) return;

    initFlag.current = true;

    const bounds = L.latLngBounds(valid.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true, duration: 800 });
  }, [mapReady, points, fitBounds]);

  // ── Popup management ───────────────────────────────────────────────
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

      const popup = L.popup({ closeOnClick: false, maxWidth: 320, minWidth: 240 })
        .setLatLng([selectedPoint.lat, selectedPoint.lng])
        .setContent(popupHtml)
        .openOn(map);

      popupRef.current = popup;

      // Wire up interactive elements after popup opens
      setTimeout(() => {
        const selectEl = document.getElementById('leaflet-popup-trip-select');
        if (selectEl && onSelectTripForAssign) {
          selectEl.value = selectedTripIdForAssign || '';
          selectEl.addEventListener('change', (e) => {
            try { onSelectTripForAssign(e.target.value); } catch (_) { /* ignore */ }
          });
        }

        const assignBtn = document.getElementById('leaflet-popup-assign-btn');
        if (assignBtn && onConfirmAssign) {
          assignBtn.addEventListener('click', () => {
            try { onConfirmAssign(); } catch (_) { /* ignore */ }
          });
        }
      }, 50);
    } catch (err) {
      console.error('[VietmapMap] popup creation failed:', err);
    }
  }, [selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading, onSelectTripForAssign, onConfirmAssign]);

  // ── Force render fallback ─────────────────────────────────────────
  useEffect(() => {
    if (forceRender === prevForceRef.current) return;
    prevForceRef.current = forceRender;
    if (!mapRef.current) return;

    for (const [, m] of markersRef.current.entries()) {
      try { m.remove(); } catch (_) { /* ignore */ }
    }
    markersRef.current = new Map();
    renderMarkers();
  }, [forceRender, renderMarkers]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (popupRef.current) {
        try { popupRef.current.remove(); } catch (_) { /* ignore */ }
      }
      for (const [, m] of markersRef.current.entries()) {
        try { m.remove(); } catch (_) { /* ignore */ }
      }
      markersRef.current = new Map();
    };
  }, []);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <style>{`
        @keyframes vietmap-pulse {
          0%,100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.1; }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 14px 14px !important;
        }
        .leaflet-popup-close-button {
          color: #6B7280 !important;
          font-size: 18px !important;
          top: 8px !important;
          right: 10px !important;
        }
        .leaflet-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%', borderRadius: '8px', overflow: 'hidden' }}
      />
    </div>
  );
}
