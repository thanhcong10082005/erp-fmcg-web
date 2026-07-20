/**
 * VietmapMap — VietMap GL JS via CDN script injection.
 *
 * APPROACH:
 *   Inject <link> + <script> for VietMap GL JS UMD bundle, then resolve
 *   when the global `vietmapgl` is available. No ESM import, no dynamic
 *   import(), no TDZ issues — just plain script loading.
 *
 *   VietMap GL JS auto-injects the API key into every sub-resource request
 *   (tiles, fonts, sprites, icons) — no manual transformRequest needed.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ── Config ─────────────────────────────────────────────────────────
const VIETMAP_KEY     = import.meta.env.VITE_VIETMAP_TILE_API_KEY || '';
const VIETMAP_STYLE   = import.meta.env.VITE_VIETMAP_STYLE_URL     || '';
const VIETMAP_CSS_URL = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.css';
const VIETMAP_JS_URL  = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.js';

const MAP_STYLE = VIETMAP_STYLE
  ? `${VIETMAP_STYLE}${VIETMAP_STYLE.includes('?') ? '&' : '?'}apikey=${VIETMAP_KEY}`
  : `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${VIETMAP_KEY}`;

// ── Load VietMap GL JS once (singleton) ───────────────────────────
let _loadPromise = null;

function ensureVietmapGL() {
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve, reject) => {
    // Inject CSS if missing
    if (!document.querySelector(`link[href="${VIETMAP_CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = VIETMAP_CSS_URL;
      document.head.appendChild(link);
    }

    // Already loaded?
    if (window.vietmapgl) {
      resolve(window.vietmapgl);
      return;
    }

    // Listen for the global
    const script = document.createElement('script');
    script.src = VIETMAP_JS_URL;
    script.onload = () => {
      // Give the UMD IIFE a tick to execute
      setTimeout(() => {
        if (window.vietmapgl) {
          resolve(window.vietmapgl);
        } else {
          reject(new Error('vietmapgl global not set after script load'));
        }
      }, 0);
    };
    script.onerror = () => reject(new Error(`Failed to load ${VIETMAP_JS_URL}`));
    document.head.appendChild(script);
  });

  return _loadPromise;
}

// ── Build marker DOM element ───────────────────────────────────────
function buildMarkerEl(point, options = {}) {
  const el = document.createElement('div');
  el.className = 'vietmap-marker-pin';
  el.style.cssText = 'cursor:pointer;';

  const isAssigned = !!(point.metadata?.trip_id);
  const stopOrder  = point.metadata?.stop_order;
  const weight     = point.metadata?.total_weight;
  const baseColor  = point.color || '#3B82F6';
  const isSelected = options.isSelected; // batch selection

  let size = 34, label = '🏪', fontSize = 11, pulse = '';

  if (isSelected) {
    // Batch selected - green pulse ring
    size = 40;
    pulse = `<div style="position:absolute;top:-8px;left:-8px;right:-8px;bottom:-8px;border:3px solid #10B981;border-radius:50%;opacity:0.6;animation:vietmap-pulse 1.5s infinite;"></div>`;
    el.innerHTML = `
      <div style="width:${size}px;height:${size}px;background:#10B981;border:3px solid #fff;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:700;color:#fff;
        box-shadow:0 0 0 4px rgba(16,185,129,0.3), 0 4px 12px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;z-index:1;"
        title="${point.label || ''}">${label}</div>${pulse}`;
  } else if (isAssigned && stopOrder) {
    size = 42; label = String(stopOrder); fontSize = 15;
    pulse = `<div style="position:absolute;top:-6px;left:-6px;right:-6px;bottom:-6px;border:3px solid ${baseColor};border-radius:50%;opacity:0.3;animation:vietmap-pulse 2s infinite;"></div>`;
    el.innerHTML = `
      <div style="width:${size}px;height:${size}px;background:${baseColor};border:3px solid #fff;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:700;color:#fff;
        box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;z-index:1;"
        title="${point.label || ''}${isAssigned && stopOrder ? ` — Stop #${stopOrder}` : ''}">${label}</div>${pulse}`;
  } else if (typeof weight === 'number' && weight > 0) {
    if (weight >= 500)      { size = 38; label = '📦'; fontSize = 13; }
    else if (weight >= 200) { size = 36; label = '📦'; fontSize = 12; }
    else if (weight >= 100) { size = 34; label = '🏪'; fontSize = 11; }
    el.innerHTML = `
      <div style="width:${size}px;height:${size}px;background:${baseColor};border:3px solid #fff;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:700;color:#fff;
        box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;z-index:1;"
        title="${point.label || ''}">${label}</div>`;
  } else {
    el.innerHTML = `
      <div style="width:${size}px;height:${size}px;background:${baseColor};border:3px solid #fff;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:700;color:#fff;
        box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;z-index:1;"
        title="${point.label || ''}">${label}</div>`;
  }
  return el;
}

// ── Build popup HTML ───────────────────────────────────────────────
function buildPopupHTML(point, tripOptions, selectedTripId, assignLoading) {
  const partner = point.metadata || {};
  const weight = partner.total_weight
    ? `${Number(partner.total_weight).toLocaleString('vi-VN')} kg` : '—';
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
        <select id="vietmap-popup-trip-select" style="width:100%;margin-top:4px;padding:4px 8px;border:1px solid #D1D5DB;border-radius:4px;font-size:13px;box-sizing:border-box;">
          <option value="">— Chọn chuyến —</option>${tripOptsHTML}
        </select>
        <button id="vietmap-popup-assign-btn" style="width:100%;margin-top:6px;padding:6px 12px;background:#2563EB;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-weight:600;opacity:${assignLoading ? '0.7' : '1'};">
          ${assignLoading ? '⏳ Đang lưu...' : '✅ Gán đơn'}
        </button>
      </div>
    </div>`;
}

// ── Main component ────────────────────────────────────────────────
export default function VietmapMap({
  points = [],
  selectedIds = [], // array of point IDs that are batch-selected
  center = { lat: 10.762622, lng: 106.660172 },
  zoom = 11,
  height = '500px',
  onPointClick,
  fitBounds = true,
  draggable = false,
  onLocationChange,
  routeGeometry = null,
  routeColor = '#2563EB',
  routeWidth = 4,
  routeOpacity = 0.8,
  selectedPoint = null,
  tripOptions = [],
  selectedTripIdForAssign = '',
  onSelectTripForAssign,
  onConfirmAssign,
  assignLoading = false,
  onMapReady,
  forceRender = 0,
  boundsKey,           // trigger re-fit when trip changes
  // Phase L: Batch selection
  batchMode = false,
  batchRect = null,
  onBatchRectChange,
  onBatchDrawComplete,
}) {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef(new Map());
  const popupRef        = useRef(null);
  const initFlag        = useRef(false);
  const prevBoundsKey   = useRef(null);
  const prevForceRef    = useRef(forceRender);
  const prevSelectedRef = useRef(null);
  // Phase L: drawing state refs
  const drawStartRef    = useRef(null);
  const drawOverlayRef  = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [libError, setLibError] = useState(null);

  // Phase L: Drawing state (managed by component, not refs)
  const [drawing, setDrawing] = useState(false);
  const [drawRect, setDrawRect] = useState(null); // { startX, startY, endX, endY } in container coords

  // ── Init VietMap GL JS ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    ensureVietmapGL()
      .then((VietmapGL) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = new VietmapGL.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [center.lng, center.lat], // [lng, lat] — GeoJSON order
          zoom,
          zoomControl: true,
          vietmapLogo: false,
        });

        map.addControl(new VietmapGL.NavigationControl(), 'top-right');

        map.on('load', () => {
          if (cancelled) return;
          mapRef.current = map;
          setMapReady(true);
          if (onMapReady) {
            try { onMapReady(map); } catch (_) { /* ignore */ }
          }
        });

        map.on('error', (e) => {
          const msg = e?.error?.message || e?.error?.id || '';
          if (msg && msg !== 'http') {
            // eslint-disable-next-line no-console
            console.warn('[VietmapMap] map error:', msg);
          }
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[VietmapMap] load error:', err);
        if (!cancelled) setLibError(err.message || 'Failed to load map library');
      });

    return () => {
      cancelled = true;
      if (popupRef.current) {
        try { popupRef.current.remove(); } catch (_) { /* ignore */ }
        popupRef.current = null;
      }
      for (const [, m] of markersRef.current.entries()) {
        try { m.remove(); } catch (_) { /* ignore */ }
      }
      markersRef.current = new Map();
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) { /* ignore */ }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render markers ───────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || map.isRemoved?.()) return;

    // Wait for map to be fully ready
    if (!map.isStyleLoaded?.()) return;

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const map_ = markersRef.current;
    const selectedSet = new Set(selectedIds);

    // Remove stale markers
    for (const [id, marker] of map_.entries()) {
      if (!valid.some(p => p.id === id)) {
        try { marker.remove(); } catch (_) { /* ignore */ }
        map_.delete(id);
      }
    }

    // Add / update markers
    valid.forEach(p => {
      const existing = map_.get(p.id);
      const isSelected = selectedSet.has(p.id);

      if (existing) {
        // Reposition if lat/lng changed
        const ll = existing.getLngLat();
        if (Math.abs(ll.lat - p.lat) > 1e-9 || Math.abs(ll.lng - p.lng) > 1e-9) {
          try { existing.setLngLat([p.lng, p.lat]); } catch (_) { /* ignore */ }
        }
        // Rebuild element if selection state changed
        if (isSelected !== existing._isSelected) {
          try {
            const el = buildMarkerEl(p, { isSelected });
            existing.getElement().replaceWith(el);
            existing._isSelected = isSelected;
            // Re-attach click handler
            if (onPointClick) {
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                try { onPointClick(p); } catch (_) { /* ignore */ }
              });
            }
          } catch (_) { /* ignore */ }
        }
        return;
      }

      try {
        const el = buildMarkerEl(p, { isSelected });
        const VM = window.vietmapgl;
        const marker = new VM.Marker({ element: el, draggable: !!draggable })
          .setLngLat([p.lng, p.lat]) // [lng, lat] order
          .addTo(map);
        marker._isSelected = isSelected;

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
        console.error('[VietmapMap] marker error:', err);
      }
    });
  }, [points, draggable, onPointClick, onLocationChange]);

  // ── Update route ────────────────────────────────────────────────
  const updateRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || map.isRemoved?.()) return;
    if (!map.isStyleLoaded?.()) return;

    const SOURCE = 'planned-route', LAYER = 'planned-route-layer', OUTL = 'planned-route-outline';

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

  // ── Re-render when data changes ──────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    renderMarkers();
    updateRoute();
  }, [mapReady, points, selectedIds, routeGeometry]);

  // ── Fit bounds on first load + re-fit when boundsKey changes ──────
  useEffect(() => {
    if (!mapReady || !fitBounds) return;
    const map = mapRef.current;
    if (!map) return;
    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (valid.length < 1) return;

    // Re-fit only when boundsKey changes (e.g., trip selection)
    if (boundsKey !== undefined && boundsKey !== null && boundsKey === prevBoundsKey.current) {
      return;
    }
    prevBoundsKey.current = boundsKey;

    if (valid.length === 1) {
      try {
        map.flyTo({ center: [valid[0].lng, valid[0].lat], zoom: 14, duration: 800 });
      } catch (_) { /* ignore */ }
      return;
    }

    let minLng = valid[0].lng, maxLng = valid[0].lng;
    let minLat = valid[0].lat, maxLat = valid[0].lat;
    valid.forEach(p => {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    });
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 800, maxZoom: 14 });
    } catch (_) { /* ignore */ }
  }, [mapReady, points, fitBounds, boundsKey]);

  // ── Popup ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!selectedPoint) {
      if (popupRef.current) { try { popupRef.current.remove(); } catch (_) { /* ignore */ } popupRef.current = null; }
      prevSelectedRef.current = null;
      return;
    }
    if (prevSelectedRef.current?.id === selectedPoint.id) return;
    prevSelectedRef.current = selectedPoint;

    if (popupRef.current) { try { popupRef.current.remove(); } catch (_) { /* ignore */ } popupRef.current = null; }

    try {
      const VM = window.vietmapgl;
      const popupHtml = buildPopupHTML(selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading);
      const popup = new VM.Popup({ closeOnClick: false, maxWidth: '320px' })
        .setLngLat([selectedPoint.lng, selectedPoint.lat])
        .setHTML(popupHtml)
        .addTo(map);

      popupRef.current = popup;

      popup.once('open', () => {
        setTimeout(() => {
          const selectEl = document.getElementById('vietmap-popup-trip-select');
          if (selectEl && onSelectTripForAssign) {
            selectEl.value = selectedTripIdForAssign || '';
            selectEl.addEventListener('change', (e) => { try { onSelectTripForAssign(e.target.value); } catch (_) { /* ignore */ } });
          }
          const assignBtn = document.getElementById('vietmap-popup-assign-btn');
          if (assignBtn && onConfirmAssign) {
            assignBtn.addEventListener('click', () => { try { onConfirmAssign(); } catch (_) { /* ignore */ } });
          }
        }, 50);
      });
    } catch (err) {
      console.error('[VietmapMap] popup error:', err);
    }
  }, [selectedPoint, mapReady, tripOptions, selectedTripIdForAssign, assignLoading, onSelectTripForAssign, onConfirmAssign]);

  // ── Force render ────────────────────────────────────────────────
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

  // ── Phase L: Batch selection - mouse event handlers ───────────────
  // Handled via JSX overlay div (see below)
  // These handlers are called from the JSX overlay div
  const handleBatchMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDrawing(true);
    setDrawRect({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    });
  }, []);

  const handleBatchMouseMove = useCallback((e) => {
    if (!drawing || !drawRect) return;
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDrawRect(prev => ({
      ...prev,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    }));
  }, [drawing, drawRect]);

  const handleBatchMouseUp = useCallback((e) => {
    if (!drawing || !drawRect) return;
    e.preventDefault();

    const dist = Math.sqrt((drawRect.endX - drawRect.startX) ** 2 + (drawRect.endY - drawRect.startY) ** 2);

    if (dist < 10) {
      // Too small, cancel
      setDrawing(false);
      setDrawRect(null);
      return;
    }

    // Complete - notify parent
    if (onBatchRectChange) onBatchRectChange(drawRect);
    if (onBatchDrawComplete && mapRef.current) {
      onBatchDrawComplete(mapRef.current);
    }

    setDrawing(false);
    setDrawRect(null);
  }, [drawing, drawRect, onBatchRectChange, onBatchDrawComplete]);

  // ── Disable map drag when batch mode is active ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (batchMode) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
    }

    return () => {
      if (map && !map.isRemoved?.()) {
        map.dragPan.enable();
        map.scrollZoom.enable();
        map.boxZoom.enable();
        map.doubleClickZoom.enable();
      }
    };
  }, [batchMode, mapReady]);

  // Compute SVG rect from drawRect
  const svgRect = drawRect ? {
    x: Math.min(drawRect.startX, drawRect.endX),
    y: Math.min(drawRect.startY, drawRect.endY),
    w: Math.abs(drawRect.endX - drawRect.startX),
    h: Math.abs(drawRect.endY - drawRect.startY),
  } : null;

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <style>{`
        @keyframes vietmap-pulse {
          0%,100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.1; }
        }
        .vietmapgl-popup-content-wrapper {
          border-radius: 8px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          padding: 0 !important;
        }
        .vietmapgl-popup-content { margin: 14px 14px !important; }
        .vietmapgl-popup-close-button {
          color: #6B7280 !important; font-size: 18px !important;
          top: 8px !important; right: 10px !important;
        }
      `}</style>
      {libError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', color: '#dc2626', fontFamily: 'system-ui', fontSize: 14, zIndex: 10,
          textAlign: 'center', padding: 16,
        }}>
          <div>
            <div style="font-size:20px;margin-bottom:8px;">⚠️</div>
            <div>Không thể tải bản đồ VietMap.<br /><code style="font-size:12px;color:#6B7280;">{libError}</code></div>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: '8px', overflow: 'hidden' }} />

      {/* Phase L: Batch selection overlay - rendered in JSX */}
      {batchMode && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'all',
            zIndex: 100,
            cursor: 'crosshair',
          }}
          onMouseDown={handleBatchMouseDown}
          onMouseMove={handleBatchMouseMove}
          onMouseUp={handleBatchMouseUp}
          onMouseLeave={() => {
            if (drawing) {
              setDrawing(false);
              setDrawRect(null);
            }
          }}
        >
          {/* SVG layer for drawing rectangle */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
          >
            {svgRect && svgRect.w > 0 && svgRect.h > 0 && (
              <rect
                x={svgRect.x}
                y={svgRect.y}
                width={svgRect.w}
                height={svgRect.h}
                fill="rgba(5, 150, 105, 0.15)"
                stroke="#059669"
                strokeWidth="3"
                strokeDasharray="8,4"
              />
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
