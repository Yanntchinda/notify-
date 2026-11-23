'use strict';

window.T = window.T || {};

(function () {
  const instances = new Set();

  /* Fonds de plan de rues gratuits, du plan de rues classique aux variantes.
     Aucune clé d’API : chaque fournisseur ne demande que l’attribution. */
  const BASE_LAYERS = [
    {
      id: 'esri',
      label: 'Plan de rues',
      name: 'Esri World Street Map',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19 },
      attribution: 'Fond de plan &copy; <a href="https://www.esri.com/">Esri</a>',
    },
    {
      id: 'osm',
      label: 'OpenStreetMap',
      name: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { subdomains: 'abc', maxZoom: 19 },
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributeurs',
    },
    {
      id: 'carto',
      label: 'Voyager',
      name: 'CARTO Voyager',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      options: { subdomains: 'abcd', maxZoom: 19 },
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  ];

  const BASE_STORAGE_KEY = 'transit_basemap';
  const TILE_ERROR_LIMIT = 6;
  const TILE_TIMEOUT_MS = 12000;

  function preferredBaseId() {
    try {
      const saved = localStorage.getItem(BASE_STORAGE_KEY);
      return BASE_LAYERS.some((item) => item.id === saved) ? saved : null;
    } catch (err) {
      return null;
    }
  }

  function markerColor(role) {
    if (role === 'loading') return '#0e6ba8';
    if (role === 'discharge') return '#0f9d8f';
    return '#6c5ce7';
  }

  function buildChain(preferredId) {
    const preferred = BASE_LAYERS.findIndex((item) => item.id === preferredId);
    if (preferred < 0) return BASE_LAYERS.slice();
    return [BASE_LAYERS[preferred], ...BASE_LAYERS.filter((item) => item.id !== preferredId)];
  }

  function attachStreetBase(map, container) {
    let layer = null;
    let dead = false;
    let watchdog = null;
    let chain = buildChain(preferredBaseId());
    let pos = 0;

    const badge = document.createElement('div');
    badge.className = 'map-source';
    badge.textContent = `Plan de rues · ${chain[0].name}`;
    container.appendChild(badge);

    const control = document.createElement('div');
    control.className = 'map-basemap';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Fond de carte');
    control.innerHTML = BASE_LAYERS.map(
      (item) =>
        `<button type="button" data-base="${item.id}" title="${item.name} — plan gratuit" aria-pressed="false">${item.label}</button>`
    ).join('');
    container.appendChild(control);

    function syncControl(activeId) {
      for (const button of control.querySelectorAll('button[data-base]')) {
        const on = button.dataset.base === activeId;
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    function clearWatchdog() {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    }

    function stopLayer() {
      if (!layer) return;
      try {
        map.removeLayer(layer);
      } catch (err) {
        /* noop */
      }
      layer = null;
    }

    function showOffline() {
      if (!container.isConnected) return;
      if (container.querySelector('.map-offline')) return;
      const overlay = document.createElement('div');
      overlay.className = 'map-offline';
      overlay.innerHTML =
        '<strong>Plan de rues indisponible</strong>' +
        '<span>Vérifiez votre connexion internet, puis réessayez.</span>' +
        '<button type="button" class="btn btn-outline btn-sm">Réessayer</button>';
      container.appendChild(overlay);
      overlay.querySelector('button').addEventListener('click', () => {
        overlay.remove();
        start(0);
      });
    }

    function start(nextPos) {
      clearWatchdog();
      stopLayer();
      dead = false;
      pos = nextPos;
      const def = chain[pos];
      const isLast = pos === chain.length - 1;
      badge.textContent = `Plan de rues · ${def.name}`;
      syncControl(def.id);

      const current = L.tileLayer(def.url, { ...def.options, attribution: def.attribution });
      layer = current;
      let errors = 0;
      let loaded = 0;
      const active = () => layer === current;

      current.on('tileload', () => {
        if (!active()) return;
        loaded += 1;
        clearWatchdog();
      });

      current.on('tileerror', () => {
        if (!active() || loaded > 0 || dead) return;
        errors += 1;
        if (errors < TILE_ERROR_LIMIT) return;
        if (isLast) {
          dead = true;
          clearWatchdog();
          showOffline();
          return;
        }
        start(pos + 1);
      });

      current.addTo(map);

      watchdog = setTimeout(() => {
        watchdog = null;
        if (!active() || loaded > 0 || dead) return;
        if (isLast) {
          dead = true;
          showOffline();
          return;
        }
        start(pos + 1);
      }, TILE_TIMEOUT_MS);
    }

    control.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-base]');
      if (!button) return;
      const id = button.dataset.base;
      if (chain[pos] && chain[pos].id === id) return;
      chain = buildChain(id);
      try {
        localStorage.setItem(BASE_STORAGE_KEY, id);
      } catch (err) {
        /* stockage indisponible (navigation privée) : on garde le choix en mémoire */
      }
      start(0);
    });

    start(0);

    return {
      destroy() {
        dead = true;
        clearWatchdog();
        stopLayer();
        badge.remove();
        control.remove();
        const overlay = container.querySelector('.map-offline');
        if (overlay) overlay.remove();
      },
    };
  }

  function create(el, options = {}) {
    if (!el) return null;
    if (typeof L === 'undefined') {
      el.innerHTML = '<div class="map-fallback">La carte n’est pas disponible hors connexion.</div>';
      return null;
    }
    const map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    });
    const base = attachStreetBase(map, el);
    map.setView(options.center || [4.5, 10], options.zoom || 5);

    const instance = {
      map,
      portMarkers: [],
      routeLine: null,
      clientMarker: null,
      setPorts(ports, fit = false) {
        for (const marker of instance.portMarkers) marker.remove();
        instance.portMarkers = [];
        const bounds = [];
        for (const port of ports || []) {
          const marker = L.circleMarker([port.lat, port.lng], {
            radius: 8,
            color: '#ffffff',
            weight: 2.5,
            fillColor: markerColor(port.role),
            fillOpacity: 1,
          })
            .addTo(map)
            .bindTooltip(
              `<strong>${T.ui.esc(port.name)}</strong><br>${T.ui.flag(port.countryCode)} ${T.ui.esc(port.country)}`,
              { direction: 'top', offset: [0, -8] }
            );
          instance.portMarkers.push(marker);
          bounds.push([port.lat, port.lng]);
        }
        if (fit && bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36] });
      },
      setClient(lat, lng, label = 'Votre position') {
        if (instance.clientMarker) instance.clientMarker.remove();
        if (lat == null || lng == null) {
          instance.clientMarker = null;
          return;
        }
        const pin = L.divIcon({
          className: 'client-pin-wrap',
          html: '<div class="client-pin"><span></span></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        });
        instance.clientMarker = L.marker([lat, lng], { icon: pin, zIndexOffset: 1000 })
          .addTo(map)
          .bindTooltip(`<strong>${T.ui.esc(label)}</strong>`, { direction: 'top', offset: [0, -24] });
      },
      setRoute(coords, fit = false) {
        if (instance.routeLine) instance.routeLine.remove();
        instance.routeLine = null;
        if (!coords || coords.length < 2) return;
        instance.routeLine = L.polyline(coords, {
          color: '#0e6ba8',
          weight: 4,
          opacity: 0.85,
          dashArray: '7 7',
          lineCap: 'round',
        }).addTo(map);
        if (fit) instance.fitAll();
      },
      fitAll() {
        const points = [];
        if (instance.clientMarker) {
          const latlng = instance.clientMarker.getLatLng();
          points.push([latlng.lat, latlng.lng]);
        }
        for (const marker of instance.portMarkers) {
          const latlng = marker.getLatLng();
          points.push([latlng.lat, latlng.lng]);
        }
        if (instance.routeLine) {
          for (const latlng of instance.routeLine.getLatLngs()) points.push([latlng.lat, latlng.lng]);
        }
        if (!points.length) return;
        if (points.length === 1) {
          map.setView(points[0], 10);
          return;
        }
        map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 12 });
      },
      setView(lat, lng, zoom = 8) {
        map.setView([lat, lng], zoom);
      },
      invalidate() {
        setTimeout(() => map.invalidateSize(), 60);
      },
      destroy() {
        if (base) base.destroy();
        map.remove();
      },
    };
    instances.add(instance);
    return instance;
  }

  function destroyAll() {
    for (const instance of instances) {
      try {
        instance.destroy();
      } catch (err) {
        /* noop */
      }
    }
    instances.clear();
  }

  function haversine(a, b) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function nearestPort(lat, lng, ports) {
    if (!ports || !ports.length) return null;
    return ports
      .map((port) => ({ port, distance: haversine({ lat, lng }, port) }))
      .sort((a, b) => a.distance - b.distance)[0].port;
  }

  async function fetchWithTimeout(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function search(query) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      limit: '1',
      addressdetails: '1',
      'accept-language': 'fr',
    });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('search-failed');
    const results = await response.json();
    if (!results.length) return null;
    const result = results[0];
    const address = result.address || {};
    const city =
      address.city || address.town || address.village || address.municipality || address.county || address.state || result.name || '';
    return {
      lat: Number(result.lat),
      lng: Number(result.lon),
      displayName: result.display_name || result.name || query,
      city,
      country: address.country || '',
      countryCode: (address.country_code || '').toUpperCase(),
      name: city || result.name || query,
    };
  }

  async function reverse(lat, lng) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      'accept-language': 'fr',
      zoom: '10',
    });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('reverse-failed');
    const result = await response.json();
    const address = result.address || {};
    const city =
      address.city || address.town || address.village || address.municipality || address.county || address.state || '';
    return {
      lat,
      lng,
      displayName: result.display_name || city || 'Votre position',
      city,
      country: address.country || '',
      countryCode: (address.country_code || '').toUpperCase(),
      name: city || 'Votre position',
    };
  }

  async function route(from, to) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
    let response;
    try {
      response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
    } catch (err) {
      throw new Error('network');
    }
    if (!response.ok) throw new Error('network');
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error('no-route');
    }
    const best = data.routes[0];
    return {
      km: best.distance / 1000,
      durationMin: best.duration / 60,
      coords: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      mode: 'road',
    };
  }

  T.map = { create, destroyAll, haversine, nearestPort };
  T.geo = { search, reverse, route, haversine, nearestPort };
})();
