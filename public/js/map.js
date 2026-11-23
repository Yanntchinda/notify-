'use strict';

window.T = window.T || {};

(function () {
  const instances = new Set();

  function markerColor(role) {
    if (role === 'loading') return '#0e6ba8';
    if (role === 'discharge') return '#0f9d8f';
    return '#6c5ce7';
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
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
