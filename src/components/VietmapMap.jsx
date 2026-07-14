/**
 * VietmapMap — Reusable wrapper around Vietmap GL JS.
 *
 * Loaded via CDN (unpkg) to avoid bundling 12MB into the main app.
 * Vietmap GL JS UMD bundle exposes global `vietmapgl` (not `vietmap`).
 *
 * Props:
 *   - points:            Array<{ lat, lng, id, label, color?, metadata? }>
 *   - center:            { lat, lng }   — initial map center
 *   - zoom:              number         — initial zoom (default 11)
 *   - height:            string         — CSS height (default '500px')
 *   - onPointClick:      (point) => void
 *   - fitBounds:         boolean        — auto-fit to points (default true)
 *   - draggable:         boolean        — pins are draggable
 *   - onLocationChange:  ({id, lat, lng}) => void  — fires after drag
 *
 * Phase 3 — Route Lines:
 *   - routeGeometry:     GeoJSON LineString | null — route line to render
 *   - routeColor:        string — line color (default #2563EB)
 *   - routeWidth:        number — line width px (default 3)
 *
 * Phase 4 — Popup:
 *   - selectedPoint:      point | null — điểm đang được chọn (hiện popup)
 *   - onAssignRequest:   (point) => void — user bấm "Gán" trên popup
 *   - tripOptions:        Array<{trip_id, trip_number}> — dropdown trong popup
 *
 * Phase 5 — Data-rich Pins:
 *   - stop_order:        lấy từ point.metadata.stop_order
 *   - total_weight:      lấy từ point.metadata.total_weight
 */

import React, { useEffect, useRef } from 'react';

const VIETMAP_CSS    = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.css';
const VIETMAP_JS     = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.js';
const VIETMAP_GLOBAL = 'vietmapgl';

const RAW_API_BASE      = import.meta.env.VITE_API_URL || '';
const API_ORIGIN        = RAW_API_BASE.replace(/\/+$/, '').replace(/\/api$/, '');
const VIETMAP_PROXY_BASE = `${API_ORIGIN}/api/vietmap`;

const VIETMAP_API_KEY      = import.meta.env.VITE_VIETMAP_API_KEY      || '';
const VIETMAP_TILE_API_KEY = import.meta.env.VITE_VIETMAP_TILE_API_KEY || '';
const VIETMAP_STYLE_URL    = import.meta.env.VITE_VIETMAP_STYLE       || '';
const USE_VIETMAP          = import.meta.env.VITE_USE_VIETMAP_TILES === 'true';

const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';

let RESOLVED_STYLE_URL;
if (import.meta.env.VITE_MAP_STYLE_URL) {
  RESOLVED_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL;
} else if (USE_VIETMAP && VIETMAP_TILE_API_KEY) {
  RESOLVED_STYLE_URL = VIETMAP_STYLE_URL
    ? `${VIETMAP_STYLE_URL}${VIETMAP_STYLE_URL.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(VIETMAP_TILE_API_KEY)}`
    : `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${encodeURIComponent(VIETMAP_TILE_API_KEY)}`;
} else {
  if (USE_VIETMAP && !VIETMAP_TILE_API_KEY) {
    // eslint-disable-next-line no-console
    console.info('[VietmapMap] TILE_KEY chưa set — đang dùng OpenFreeMap. Set VITE_VIETMAP_TILE_API_KEY trên Vercel để dùng tile Vietmap.');
  }
  RESOLVED_STYLE_URL = OPENFREEMAP_LIBERTY;
}

// eslint-disable-next-line no-console
console.info(
  '[VietmapMap] config →',
  'USE_VIETMAP=', USE_VIETMAP,
  '| TILE_KEY set:', !!import.meta.env.VITE_VIETMAP_TILE_API_KEY,
  '| style:', RESOLVED_STYLE_URL.substring(0, 70) + (RESOLVED_STYLE_URL.length > 70 ? '…' : ''),
);

let vietmapLoading = null;

function loadVietmap() {
  if (typeof window !== 'undefined' && window[VIETMAP_GLOBAL]) {
    return Promise.resolve(window[VIETMAP_GLOBAL]);
  }
  if (vietmapLoading) return vietmapLoading;

  vietmapLoading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${VIETMAP_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = VIETMAP_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector('script[data-vietmap-gl]');
    if (existing) {
      if (window[VIETMAP_GLOBAL]) resolve(window[VIETMAP_GLOBAL]);
      else existing.addEventListener('load', () => resolve(window[VIETMAP_GLOBAL]));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = VIETMAP_JS;
    script.async = true;
    script.dataset.vietmapGl = 'true';
    script.onload = () => {
      if (window[VIETMAP_GLOBAL]) resolve(window[VIETMAP_GLOBAL]);
      else reject(new Error('Vietmap script loaded but window.vietmapgl is undefined'));
    };
    script.onerror = () => reject(new Error('Failed to load Vietmap GL JS from CDN'));
    document.head.appendChild(script);
  });

  return vietmapLoading;
}

export default function VietmapMap({
  points = [],
  center = { lat: 10.762622, lng: 106.660172 },
  zoom = 11,
  height = '500px',
  onPointClick,
  fitBounds = true,
  draggable = false,
  onLocationChange,
  // Phase 3: Route Line
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
  // Phase 6: Callback khi map ready (dùng cho AuditMap thêm layers tùy chỉnh)
  onMapReady,
  // Force re-render marker layer (increment to force remount)
  forceRender = 0,
}) {
  const containerRef  = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = React.useRef(new Map());     // id → Marker
  const popupRef     = useRef(null);              // Vietmap Popup instance
  const initFlag     = React.useRef(false);
  // Track previous forceRender to detect changes
  const prevForceRef = React.useRef(forceRender);

  // ── Phase 3: Route line management ────────────────────────────────
  function updateRouteLayer(map, vietmap) {
    if (!map || !vietmap) return;
    const SOURCE = 'planned-route';
    const LAYER  = 'planned-route-layer';
    const POPUP_LAYER = 'planned-route-labels';

    if (!routeGeometry || routeGeometry.type !== 'LineString' || !routeGeometry.coordinates?.length) {
      // Remove route
      if (map.getLayer(POPUP_LAYER)) map.removeLayer(POPUP_LAYER);
      if (map.getLayer(LAYER))      map.removeLayer(LAYER);
      if (map.getSource(SOURCE))     map.removeSource(SOURCE);
      return;
    }

    const geojson = {
      type: 'Feature',
      geometry: routeGeometry,
      properties: {},
    };

    if (map.getSource(SOURCE)) {
      map.getSource(SOURCE).setData(geojson);
    } else {
      map.addSource(SOURCE, { type: 'geojson', data: geojson });

      // Main line
      map.addLayer({
        id: LAYER,
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': routeWidth,
          'line-opacity': routeOpacity,
        },
      });

      // Subtle dashed outline for contrast
      map.addLayer({
        id: LAYER + '-outline',
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': routeWidth + 4,
          'line-opacity': 0.3,
        },
      }, LAYER);
    }

    // Update existing layer paint (color/width may have changed)
    if (map.getLayer(LAYER)) {
      map.setPaintProperty(LAYER, 'line-color', routeColor);
      map.setPaintProperty(LAYER, 'line-width', routeWidth);
      map.setPaintProperty(LAYER, 'line-opacity', routeOpacity);
    }
  }

  // ── Phase 4: Popup management ──────────────────────────────────────
  function closePopup() {
    if (popupRef.current) {
      try { popupRef.current.remove(); } catch (_) { /* ignore */ }
      popupRef.current = null;
    }
  }

  function buildPopupHTML(point, tripOpts, selectedTrip, onSelect, onConfirm, loading) {
    const partner = point.metadata || {};
    const weight  = partner.total_weight
      ? `${Number(partner.total_weight).toLocaleString('vi-VN')} kg`
      : '—';
    const stopNum = partner.stop_order ? `Số thứ tự: ${partner.stop_order}` : '';
    const currentTrip = partner.trip_id
      ? `<span style="color:#2563EB">✓ Thuộc chuyến #${partner.trip_id}</span>`
      : '<span style="color:#6B7280">Chưa gán chuyến</span>';

    const tripOptionsHTML = tripOpts
      .map(t => `<option value="${t.trip_id}" ${String(selectedTrip) === String(t.trip_id) ? 'selected' : ''}>${t.trip_number}</option>`)
      .join('');

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-width:240px;max-width:300px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:14px;color:#111827;">${point.label || 'Khách hàng'}</strong>
          <button id="vietmap-popup-close" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0;line-height:1;color:#6B7280;">✕</button>
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
            ${tripOptionsHTML}
          </select>
          <button id="vietmap-popup-assign-btn"
            style="width:100%;margin-top:6px;padding:6px 12px;background:#2563EB;color:#fff;border:none;border-radius:4px;
                   font-size:13px;cursor:pointer;font-weight:600;"
            ${!selectedTrip || loading ? 'disabled style="background:#93C5FD;cursor:not-allowed;"' : ''}>
            ${loading ? '⏳ Đang gán...' : '✅ Gán vào chuyến'}
          </button>
        </div>
      </div>
    `;
  }

  function showPopup(point, tripOpts, selectedTrip, onSelect, onConfirm, loading) {
    const map = mapRef.current;
    if (!map || !window[VIETMAP_GLOBAL]) return;

    closePopup();

    const vietmap = window[VIETMAP_GLOBAL];
    const html = buildPopupHTML(point, tripOpts, selectedTrip, onSelect, onConfirm, loading);

    popupRef.current = new vietmap.Popup({
      closeOnClick: false,
      offset: 25,
      maxWidth: '320px',
      className: 'vietmap-custom-popup',
    })
      .setLngLat([point.lng, point.lat])
      .setHTML(html)
      .addTo(map);

    // Bind event handlers after popup renders
    popupRef.current.on('open', () => {
      const closeBtn = document.getElementById('vietmap-popup-close');
      if (closeBtn) closeBtn.addEventListener('click', closePopup);

      const selectEl = document.getElementById('vietmap-popup-trip-select');
      if (selectEl) {
        selectEl.addEventListener('change', (e) => {
          onSelect(e.target.value);
        });
      }

      const assignBtn = document.getElementById('vietmap-popup-assign-btn');
      if (assignBtn && !loading) {
        assignBtn.addEventListener('click', () => {
          onConfirm();
        });
      }
    });
  }

  // ── Mount: load Vietmap + init map ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    loadVietmap().then((vietmap) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new vietmap.Map({
        container: containerRef.current,
        style:     RESOLVED_STYLE_URL,
        center:    [center.lng, center.lat],
        zoom,
        transformRequest: (url) => {
          if (typeof url !== 'string') return { url };
          if (url.startsWith(VIETMAP_PROXY_BASE)) return { url };
          if (!USE_VIETMAP || VIETMAP_TILE_API_KEY || !url.includes('maps.vietmap.vn')) {
            return { url };
          }
          let u = url;
          if (!/[?&]apikey=[^&]+/.test(u) && !/[?&]api[-_]key=[^&]+/i.test(u)) {
            u += (u.includes('?') ? '&' : '?') + 'apikey=' + encodeURIComponent(VIETMAP_API_KEY);
          }
          const proxied = u.replace('https://maps.vietmap.vn', VIETMAP_PROXY_BASE);
          return { url: proxied, credentials: 'omit' };
        },
      });

      map.addControl(new vietmap.NavigationControl(), 'top-right');

      map.on('load', () => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = map;

        try {
          renderMarkers(map, vietmap);
          updateRouteLayer(map, vietmap);
        } catch (err) {
          console.error('[VietmapMap] render error:', err);
        }

        const validPoints = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
        if (fitBounds && validPoints.length > 1 && !initFlag.current) {
          initFlag.current = true;
          try { fitMapToPoints(map, validPoints); } catch (_) { /* ignore */ }
        }

        if (onMapReady) {
          try { onMapReady(map); } catch (_) { /* ignore */ }
        }
      });

      // Handle resource errors gracefully — don't crash the map
      map.on('error', (e) => {
        if (cancelled) return;
        // Only log non-critical tile errors; do NOT retry (retries cause more instability)
        const errId = e?.error?.id || '';
        const isTileError = ['http', 'tiles', 'socket', 'webgl', 'raster', 'source'].includes(errId);
        if (isTileError) {
          // Tile errors are non-fatal; just warn
          // eslint-disable-next-line no-console
          console.warn('[VietmapMap] tile/resource error (non-fatal):', errId, e?.error?.message);
        } else if (errId) {
          // eslint-disable-next-line no-console
          console.error('[VietmapMap] map error:', errId, e?.error?.message);
        }
      });
    }).catch((err) => {
      console.error('[VietmapMap] VietMapGL load failed:', err);
    });

    return () => {
      cancelled = true;
      closePopup();
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) { /* ignore */ }
        mapRef.current = null;
      }
      markersRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-render markers khi points đổi ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    loadVietmap().then((vietmap) => {
      if (!vietmap || !mapRef.current) return;
      try { renderMarkers(mapRef.current, vietmap); } catch (err) {
        console.error('[VietmapMap] renderMarkers error:', err);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── Force render fallback: if markers didn't appear after mount, force them ──
  useEffect(() => {
    if (forceRender === prevForceRef.current) return;
    prevForceRef.current = forceRender;

    const map = mapRef.current;
    if (!map) return;

    loadVietmap().then((vietmap) => {
      if (!vietmap || !mapRef.current) return;
      try {
        // Clear old markers and re-render
        for (const [, marker] of markersRef.current.entries()) {
          try { marker.remove(); } catch (_) { /* ignore */ }
        }
        markersRef.current = new Map();
        renderMarkers(mapRef.current, vietmap);
      } catch (err) {
        console.error('[VietmapMap] forceRender error:', err);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceRender]);

  // ── Phase 3: Update route layer khi geometry đổi ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    loadVietmap().then((vietmap) => {
      if (!vietmap) return;
      updateRouteLayer(map, vietmap);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGeometry, routeColor, routeWidth]);

  // ── Phase 4: Update popup khi selectedPoint/tripOptions đổi ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    loadVietmap().then((vietmap) => {
      if (!vietmap) return;
      if (selectedPoint) {
        showPopup(
          selectedPoint,
          tripOptions,
          selectedTripIdForAssign,
          (tripId) => { if (onSelectTripForAssign) onSelectTripForAssign(tripId); },
          () => { if (onConfirmAssign) onConfirmAssign(); },
          assignLoading,
        );
      } else {
        closePopup();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint, tripOptions, selectedTripIdForAssign, assignLoading]);

  // ── Phase 5: Data-rich marker HTML ─────────────────────────────────
  function buildMarkerElement(point) {
    const el = document.createElement('div');
    el.className = 'vietmap-pin';
    el.dataset.color    = baseColor;
    el.dataset.stopOrder = String(stopOrder ?? '');

    const isAssigned  = !!(point.metadata?.trip_id);
    const stopOrder  = point.metadata?.stop_order;
    const weight     = point.metadata?.total_weight;
    const baseColor  = point.color || '#3B82F6';

    if (isAssigned && stopOrder) {
      // Pin đã gán: hiện số stop_order, kích thước cố định 34px
      el.style.cssText = `
        width: 34px; height: 34px;
        background: ${baseColor};
        border: 2.5px solid #fff;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; color: #fff;
        box-shadow: 0 3px 10px rgba(0,0,0,0.35);
        cursor: pointer;
      `;
      el.textContent = stopOrder;
      el.title = `${point.label || ''} — Stop #${stopOrder}`;
    } else {
      // Pin chưa gán: scale theo weight
      let size = 20;
      let weightLabel = '';
      if (typeof weight === 'number' && weight > 0) {
        if (weight >= 500)      size = 36;
        else if (weight >= 200) size = 30;
        else if (weight >= 100) size = 24;
        weightLabel = weight >= 500 ? '📦' : weight >= 200 ? '📦' : '';
      }
      el.style.cssText = `
        width: ${size}px; height: ${size}px;
        background: #9CA3AF;
        border: 2px solid #fff;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: ${Math.max(10, size * 0.4)}px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      el.textContent = weightLabel || '🏪';
      el.title = point.label || '';
    }

    return el;
  }

  // ── Marker rendering (differential update) ─────────────────────────
  function renderMarkers(map, vietmap) {
    const valid = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const newIds = new Set(valid.map(p => p.id));
    const map_ = markersRef.current;

    // Remove markers not in points
    for (const [id, marker] of map_.entries()) {
      if (!newIds.has(id)) {
        try { marker.remove(); } catch (_) { /* ignore */ }
        map_.delete(id);
      }
    }

    // Update or create markers
    valid.forEach(p => {
      const existing = map_.get(p.id);
      const prevEl   = existing ? existing.getElement() : null;
      const prevColor = prevEl ? prevEl.dataset.color : undefined;
      const prevOrder = prevEl ? prevEl.dataset.stopOrder : undefined;

      // Determine if visual properties changed (require element rebuild)
      const visualChanged =
        prevColor !== String(p.color || '#3B82F6') ||
        prevOrder !== String(p.metadata?.stop_order ?? '');

      if (existing) {
        const ll = existing.getLngLat();
        const posChanged = Math.abs(ll.lat - p.lat) > 1e-7 || Math.abs(ll.lng - p.lng) > 1e-7;

        if (posChanged) {
          existing.setLngLat([p.lng, p.lat]);
        }

        if (visualChanged) {
          // Remove old marker + element, create fresh one
          existing.remove();
          map_.delete(p.id);
          const el = buildMarkerElement(p);
          const marker = new vietmap.Marker({ element: el, draggable })
            .setLngLat([p.lng, p.lat])
            .addTo(map);

          if (onPointClick) {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              onPointClick(p);
            });
          }

          if (draggable && onLocationChange) {
            marker.on('dragend', () => {
              const lngLat = marker.getLngLat();
              onLocationChange({ ...p, lat: lngLat.lat, lng: lngLat.lng });
            });
          }

          map_.set(p.id, marker);
        }
      } else {
        const el = buildMarkerElement(p);
        const marker = new vietmap.Marker({ element: el, draggable })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        if (onPointClick) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onPointClick(p);
          });
        }

        if (draggable && onLocationChange) {
          marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            onLocationChange({ ...p, lat: lngLat.lat, lng: lngLat.lng });
          });
        }

        map_.set(p.id, marker);
      }
    });
  }

  function fitMapToPoints(map, pts) {
    const valid = pts.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.flyTo({ center: [valid[0].lng, valid[0].lat], zoom: 14 });
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
    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 60, duration: 800, maxZoom: 14 }
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #E5E7EB',
        background: '#F3F4F6',
      }}
    >
      {!mapRef.current && (
        <div style={{ padding: 16, color: '#6B7280' }}>Đang tải bản đồ...</div>
      )}
    </div>
  );
}
