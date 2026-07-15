/**
 * VietmapMap — VietMap GL JS via dynamic CDN import.
 *
 * APPROACH:
 *   Load VietMap GL JS from CDN as a module dynamically (not a <script> tag).
 *   This avoids the TDZ/IIFE global collision bug that occurs when the UMD
 *   bundle is loaded synchronously before other JS has initialized.
 *
 *   VietMap GL JS auto-injects the API key into every sub-resource request
 *   (tiles, fonts, sprites, icons) — no manual key injection needed.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ── Config ─────────────────────────────────────────────────────────
const VIETMAP_KEY      = import.meta.env.VITE_VIETMAP_TILE_API_KEY || '';
const VIETMAP_STYLE    = import.meta.env.VITE_VIETMAP_STYLE_URL     || '';
const VIETMAP_CSS_CDN  = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.css';
const VIETMAP_JS_CDN   = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.js';

const MAP_STYLE = VIETMAP_STYLE
  ? `${VIETMAP_STYLE}${VIETMAP_STYLE.includes('?') ? '&' : '?'}apikey=${VIETMAP_KEY}`
  : `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${VIETMAP_KEY}`;

// ── Load VietMap GL JS once (singleton) ────────────────────────────
let _vietmapLoadPromise = null;

function loadVietmapGL() {
  if (_vietmapLoadPromise) return _vietmapLoadPromise;

  _vietmapLoadPromise = new Promise((resolve, reject) => {
    // 1. Inject CSS if not already present
    if (!document.querySelector(`link[href="${VIETMAP_CSS_CDN}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = VIETMAP_CSS_CDN;
      document.head.appendChild(link);
    }

    // 2. Load JS as a module script (avoids IIFE/TDZ global pollution)
    const script = document.createElement('script');
    script.type = 'module';

    // The module simply re-exports from the UMD global that gets set up
    // We use a workaround: import from the CDN as an ES module directly
    script.textContent = `
      import * as VM from '${VIETMAP_JS_CDN.replace('.js', '.esm.js')}';
      window.__vietmapGL = VM;
    `;

    // Fallback: if no ESM build, grab the global after UMD loads
    script.onerror = () => {
      const fallback = document.createElement('script');
      fallback.src = VIETMAP_JS_CDN;
      fallback.onload = () => {
        if (window.vietmapgl) {
          window.__vietmapGL = window.vietmapgl;
          resolve(window.vietmapgl);
        } else {
          reject(new Error('VietMap GL JS failed to load (no global, no ESM)'));
        }
      };
      fallback.onerror = reject;
      document.head.appendChild(fallback);
    };

    // Try ESM import first
    import(VIETMAP_JS_CDN)
      .then((mod) => {
        if (mod && mod.Map) {
          window.__vietmapGL = mod;
          resolve(mod);
        } else {
          throw new Error('ESM export missing Map');
        }
      })
      .catch(() => {
        // ESM failed, use UMD fallback
        document.head.appendChild(fallback || script);
      });

    // Actually append the fallback script for UMD
    const umdmScript = document.createElement('script');
    umdmScript.src = VIETMAP_JS_CDN;
    umdmScript.onload = () => {
      if (window.vietmapgl && !window.__vietmapGL) {
        window.__vietmapGL = window.vietmapgl;
        resolve(window.vietmapgl);
      }
    };
    umdmScript.onerror = reject;
    document.head.appendChild(umdmScript);
  });

  return _vietmapLoadPromise;
}

// ── Build marker DOM element ───────────────────────────────────────
function buildMarkerEl(point) {
  const el = document.createElement('div');
  el.className = 'vietmap-marker-pin';
  el.style.cssText = 'position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;';

  const isAssigned = !!(point.metadata?.trip_id);
  const stopOrder  = point.metadata?.stop_order;
  const weight     = point.metadata?.total_weight;
  const baseColor  = point.color || '#3B82F6';

  let size = 34, label = '🏪', fontSize = 11, pulse = '';

  if (isAssigned && stopOrder) {
    size = 42; label = String(stopOrder); fontSize = 15;
    pulse = `<div style="position:absolute;top:-6px;left:-6px;right:-6px;bottom:-6px;border:3px solid ${baseColor};border-radius:50%;opacity:0.3;animation:vietmap-pulse 2s infinite;"></div>`;
  } else if (typeof weight === 'number' && weight > 0) {
    if (weight >= 500)      { size = 38; label = '📦'; fontSize = 13; }
    else if (weight >= 200) { size = 36; label = '📦'; fontSize = 12; }
    else if (weight >= 100) { size = 34; label = '🏪'; fontSize = 11; }
  }

  const bgColor = (isAssigned && stopOrder) ? baseColor : '#6B7280';
  el.innerHTML = `
    <div style="width:${size}px;height:${size}px;background:${bgColor};border:3px solid #fff;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:700;color:#fff;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;position:relative;z-index:1;"
      title="${point.label || ''}${isAssigned && stopOrder ? ` — Stop #${stopOrder}` : ''}">${label}</div>${pulse}`;
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
  onAssignRequest,
  tripOptions = [],
  selectedTripIdForAssign = '',
  onSelectTripForAssign,
  onConfirmAssign,
  assignLoading = false,
  onMapReady,
  forceRender = 0,
}) {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef(new Map());
  const popupRef        = useRef(null);
  const initFlag        = useRef(false);
  const prevForceRef    = useRef(forceRender);
  const prevSelectedRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [libError, setLibError] = useState(null);

  // ── Init VietMap GL JS ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      try {
        const VietmapGL = await loadVietmapGL();
        if (cancelled || !containerRef.current || mapRef.current) return;

        // Inject CSS
        if (!document.querySelector(`link[href="${VIETMAP_CSS_CDN}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = VIETMAP_CSS_CDN;
          document.head.appendChild(link);
        }

        // eslint-disable-next-line no-console
        console.info('[VietmapMap] VietMap GL loaded, creating map with style:', MAP_STYLE);

        const map = new VietmapGL.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [center.lng, center.lat],
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
          // eslint-disable-next-line no-console
          if (msg) console.warn('[VietmapMap] map error:', msg);
        });

      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[VietmapMap] Failed to load VietMap GL JS:', err);
        if (!cancelled) setLibError(err.message || 'Failed to load map library');
      }
    }

    init();

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

    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const map_ = markersRef.current;

    for (const [id, marker] of map_.entries()) {
      if (!valid.some(p => p.id === id)) {
        try { marker.remove(); } catch (_) { /* ignore */ }
        map_.delete(id);
      }
    }

    valid.forEach(p => {
      const existing = map_.get(p.id);
      if (existing) {
        const ll = existing.getLngLat();
        if (Math.abs(ll.lat - p.lat) > 1e-7 || Math.abs(ll.lng - p.lng) > 1e-7) {
          existing.setLngLat([p.lng, p.lat]);
        }
        return;
      }
      try {
        const el = buildMarkerEl(p);
        const VM = window.__vietmapGL;
        const Marker = VM.Marker;
        const marker = new Marker({ element: el, draggable: !!draggable })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        if (onPointClick) {
          el.addEventListener('click', (e) => { e.stopPropagation(); try { onPointClick(p); } catch (_) { /* ignore */ } });
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
    if (!map) return;
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

  useEffect(() => {
    if (!mapReady) return;
    renderMarkers();
    updateRoute();
  }, [mapReady, points, routeGeometry]);

  // ── Fit bounds ──────────────────────────────────────────────────
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
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 800, maxZoom: 14 });
    } catch (_) { /* ignore */ }
  }, [mapReady, points, fitBounds]);

  // ── Popup ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedPoint) {
      if (popupRef.current) { try { popupRef.current.remove(); } catch (_) { /* ignore */ } popupRef.current = null; }
      prevSelectedRef.current = null;
      return;
    }
    if (prevSelectedRef.current?.id === selectedPoint.id) return;
    prevSelectedRef.current = selectedPoint;
    if (popupRef.current) { try { popupRef.current.remove(); } catch (_) { /* ignore */ } popupRef.current = null; }
    try {
      const VM = window.__vietmapGL;
      const Popup = VM.Popup;
      const popupHtml = buildPopupHTML(selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading);
      const popup = new Popup({ closeOnClick: false, maxWidth: '320px' })
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
  }, [selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading, onSelectTripForAssign, onConfirmAssign]);

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
        ${libError ? '' : ''}
      `}</style>
      {libError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', color: '#dc2626', fontFamily: 'system-ui', fontSize: 14, zIndex: 10, textAlign: 'center', padding: 16,
        }}>
          <div>
            <div style="font-size:20px;margin-bottom:8px;">⚠️</div>
            <div>Không thể tải bản đồ VietMap.<br /><code style="font-size:12px;color:#6B7280;">{libError}</code></div>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: '8px', overflow: 'hidden' }} />
    </div>
  );
}
