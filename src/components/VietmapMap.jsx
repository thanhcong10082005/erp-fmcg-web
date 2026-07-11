/**
 * VietmapMap — Reusable wrapper around Vietmap GL JS.
 *
 * Loaded via CDN (unpkg) to avoid bundling 12MB into the main app.
 *
 * NOTE: Vietmap GL JS UMD bundle exposes global `vietmapgl` (not `vietmap`).
 *
 * Props:
 *   - points:        Array<{ lat, lng, id, label, color?, metadata? }>
 *   - center:        { lat, lng }   — initial map center
 *   - zoom:          number         — initial zoom (default 11)
 *   - height:        string         — CSS height (default '500px')
 *   - onPointClick:  (point) => void
 *   - fitBounds:     boolean        — auto-fit to points (default true)
 *   - draggable:     boolean        — pins are draggable
 *   - onLocationChange: ({id, lat, lng}) => void  — fires after drag
 *
 * Usage:
 *   <VietmapMap points={pins} height="600px" onPointClick={handleClick} />
 */

import React, { useEffect, useRef } from 'react';

const VIETMAP_CSS = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.css';
const VIETMAP_JS  = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.js';

// Backend API URL — dùng cho proxy tiles (giải quyết CORS issue từ vercel.app → maps.vietmap.vn)
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Proxy URL: mọi request tiles/sprites/glyphs đều đi qua backend, không bị CORS.
//   Frontend : https://erp-fmcg-backend.onrender.com/api/vietmap/maps/tiles/.../...?apikey=...
//   Backend  → forward sang maps.vietmap.vn
//
// Env vars:
//   VITE_API_URL — backend URL (bắt buộc, vd: https://erp-fmcg-backend.onrender.com)
//   VITE_VIETMAP_API_KEY — chỉ dùng khi proxy không khả dụng (fallback)
const VIETMAP_API_KEY = import.meta.env.VITE_VIETMAP_API_KEY || '';
const VIETMAP_STYLE_URL =
  import.meta.env.VITE_VIETMAP_STYLE ||
  (API_BASE
    ? `${API_BASE}/api/vietmap/maps/styles/tm/style.json?apikey=${VIETMAP_API_KEY}`
    : `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${VIETMAP_API_KEY}`);

// Vietmap GL JS UMD exposes global `vietmapgl` (NOT `vietmap`).
const VIETMAP_GLOBAL = 'vietmapgl';

let vietmapLoading = null;

function loadVietmap() {
  if (typeof window !== 'undefined' && window[VIETMAP_GLOBAL]) {
    return Promise.resolve(window[VIETMAP_GLOBAL]);
  }
  if (vietmapLoading) return vietmapLoading;

  vietmapLoading = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${VIETMAP_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = VIETMAP_CSS;
      document.head.appendChild(link);
    }

    // JS — skip nếu đã inject
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
  center = { lat: 10.762622, lng: 106.660172 }, // Ho Chi Minh City default
  zoom = 11,
  height = '500px',
  onPointClick,
  fitBounds = true,
  draggable = false,
  onLocationChange,
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);

  // ── Mount: load Vietmap + init map ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    loadVietmap().then((vietmap) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new vietmap.Map({
        container: containerRef.current,
        style:     VIETMAP_STYLE_URL,
        center:    [center.lng, center.lat],
        zoom,
        // Proxy mọi request Vietmap qua backend của mình (giải quyết CORS).
        // Backend nhận URL upstream, inject apikey, fetch, trả về kèm
        // Access-Control-Allow-Origin: *.
        transformRequest: (url, resourceType) => {
          if (typeof url !== 'string') return { url };

          // Đã đi qua proxy → pass-through
          if (url.startsWith(API_BASE)) {
            return { url };
          }

          // Bỏ qua tile request mà URL không phải Vietmap (vd: openmaptiles khác)
          if (!url.includes('maps.vietmap.vn')) {
            return { url };
          }

          // Inject apikey nếu thiếu (defensive)
          let u = url;
          if (!/[?&]apikey=[^&]+/.test(u)) {
            u += (u.includes('?') ? '&' : '?') + 'apikey=' + VIETMAP_API_KEY;
          }

          // Đổi origin sang backend proxy
          const proxied = u.replace(
            'https://maps.vietmap.vn',
            `${API_BASE}/api/vietmap`,
          );
          return { url: proxied, credentials: 'omit' };
        },
      });

      map.addControl(new vietmap.NavigationControl(), 'top-right');

      map.on('load', () => {
        if (cancelled) return;
        renderMarkers(map, vietmap);
        if (fitBounds && points.length > 1) fitMapToPoints(map, points);
      });

      mapRef.current = map;
    }).catch((err) => {
      console.error('[VietmapMap] load failed:', err);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) { /* ignore */ }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-render markers khi points đổi ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    loadVietmap().then((vietmap) => {
      if (!vietmap || !mapRef.current) return;
      renderMarkers(mapRef.current, vietmap);
      if (fitBounds && points.length > 1) fitMapToPoints(mapRef.current, points);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  function renderMarkers(map, vietmap) {
    // Xoá markers cũ
    markersRef.current.forEach(m => {
      try { m.remove(); } catch (_) { /* ignore */ }
    });
    markersRef.current = [];

    points.forEach(p => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;

      const el = document.createElement('div');
      el.className = 'vietmap-pin';
      el.style.cssText = `
        width: 24px; height: 24px;
        background: ${p.color || '#2563EB'};
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: ${draggable ? 'grab' : 'pointer'};
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #fff;
      `;
      el.title = p.label || '';
      el.textContent = p.icon || '';

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

      markersRef.current.push(marker);
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