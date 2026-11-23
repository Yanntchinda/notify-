'use strict';

window.T = window.T || {};

(function () {
  const instances = new Set();

  /* Fonds de plan de rues gratuits, du plan de rues classique aux variantes.
     Aucune clé d’API : chaque fournisseur ne demande que l’attribution. */
  const BASE_LAYERS = [
    {
      id: 'local',
      label: 'Plan embarqué',
      name: 'Plan embarqué (Natural Earth)',
      local: true,
    },
    {
      id: 'osm',
      label: 'Plan de rues',
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

  /* ------------------------ Plan de rues embarqué ------------------------ */
  /* Données Natural Earth (domaine public) servies par l’application : la carte
     s’affiche même sans accès aux serveurs de tuiles, et les tuiles détaillées
     se superposent dès qu’elles sont disponibles. */
  const BASEMAP_FILES = {
    land: '/data/basemap-land.json',
    countries: '/data/basemap-countries.json',
    cities: '/data/cities.json',
  };

  let basemapPromise = null;

  function loadJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }

  function loadBasemap() {
    if (!basemapPromise) {
      basemapPromise = Promise.all([
        loadJson(BASEMAP_FILES.land),
        loadJson(BASEMAP_FILES.countries),
        loadJson(BASEMAP_FILES.cities),
      ]).then(([land, countries, cities]) => ({ land, countries, cities: cities || [] }));
    }
    return basemapPromise;
  }

  function ringCentroid(ring) {
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      const factor = x1 * y2 - x2 * y1;
      twiceArea += factor;
      cx += (x1 + x2) * factor;
      cy += (y1 + y2) * factor;
    }
    if (!twiceArea) return null;
    const area = twiceArea / 2;
    return { area: Math.abs(area), lat: cy / (6 * area), lng: cx / (6 * area) };
  }

  function featureCentroid(geometry) {
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
    let best = null;
    for (const polygon of polygons) {
      const ring = polygon && polygon[0];
      if (!ring) continue;
      const candidate = ringCentroid(ring);
      if (candidate && (!best || candidate.area > best.area)) best = candidate;
    }
    return best;
  }

  function addLocalBasemap(map, container) {
    const layers = [];
    if (!map.getPane('basemap')) {
      map.createPane('basemap');
      const pane = map.getPane('basemap');
      pane.style.zIndex = '150';
      pane.style.pointerEvents = 'none';
    }

    const decode = (topo, name) => {
      if (!topo || typeof topojson === 'undefined' || !topo.objects || !topo.objects[name]) return null;
      try {
        return topojson.feature(topo, topo.objects[name]);
      } catch (err) {
        return null;
      }
    };

    loadBasemap().then((data) => {
      if (!container.isConnected) return;
      try {
        addLayers(data);
      } catch (err) {
        /* le plan embarqué est un secours : son échec ne doit jamais casser la carte */
      }
    });

    function addLayers(data) {
      const land = decode(data.land, 'land');
      if (land) {
        layers.push(
          L.geoJSON(land, {
            pane: 'basemap',
            interactive: false,
            style: { color: '#e3d8c6', weight: 0.6, fillColor: '#f7f3ea', fillOpacity: 1 },
          }).addTo(map)
        );
      }
      const countries = decode(data.countries, 'countries');
      if (countries) {
        layers.push(
          L.geoJSON(countries, {
            pane: 'basemap',
            interactive: false,
            style: { color: '#d5c8b2', weight: 0.8, opacity: 0.85, fill: false },
          }).addTo(map)
        );
        addCountryLabels(countries);
      }
      for (const city of data.cities) {
        if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
        layers.push(
          L.circleMarker([city.lat, city.lng], {
            pane: 'basemap',
            interactive: false,
            radius: 2,
            color: '#8b7f6c',
            weight: 1,
            fillColor: '#b9ad97',
            fillOpacity: 1,
          }).addTo(map)
        );
        if (city.major) {
          layers.push(
            L.marker([city.lat, city.lng], {
              pane: 'basemap',
              interactive: false,
              icon: L.divIcon({
                className: 'map-city-label',
                html: T.ui.esc(city.n),
                iconSize: null,
                iconAnchor: [4, 5],
              }),
            }).addTo(map)
          );
        }
      }
    }

    /* Noms de pays sur le plan embarqué, masqués dès que l’on zoome sur les villes. */
    let countryGroup = null;
    let countryZoomHandler = null;

    function addCountryLabels(collection) {
      const labels = [];
      for (const feature of collection.features || []) {
        const props = feature.properties || {};
        const name = props.nameFr || props.name;
        const centroid = name && featureCentroid(feature.geometry);
        if (!centroid || centroid.area < 1.5) continue;
        labels.push({ name, lat: centroid.lat, lng: centroid.lng });
      }
      if (!labels.length) return;
      countryGroup = L.layerGroup();
      for (const label of labels) {
        countryGroup.addLayer(
          L.marker([label.lat, label.lng], {
            pane: 'basemap',
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'map-country-label',
              html: `<span>${T.ui.esc(label.name)}</span>`,
              iconSize: null,
              iconAnchor: [0, 0],
            }),
          })
        );
      }
      const sync = () => {
        if (!countryGroup) return;
        if (map.getZoom() <= 6) countryGroup.addTo(map);
        else map.removeLayer(countryGroup);
      };
      countryZoomHandler = sync;
      map.on('zoomend', sync);
      sync();
    }

    return {
      destroy() {
        if (countryZoomHandler) map.off('zoomend', countryZoomHandler);
        if (countryGroup) {
          try {
            map.removeLayer(countryGroup);
          } catch (err) {
            /* noop */
          }
        }
        for (const item of layers) {
          try {
            map.removeLayer(item);
          } catch (err) {
            /* noop */
          }
        }
        layers.length = 0;
      },
    };
  }

  function buildChain(preferredId) {
    const preferred = BASE_LAYERS.findIndex((item) => item.id === preferredId);
    if (preferred < 0) return BASE_LAYERS.slice();
    return [BASE_LAYERS[preferred], ...BASE_LAYERS.filter((item) => item.id !== preferredId)];
  }

  /* Sonde une seule tuile avant d’activer un fond externe : si le serveur est
     bloqué (403, proxy, pare-feu), on ne lance aucune requête de tuiles. */
  function probeTile(url) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };
      const image = new Image();
      timer = setTimeout(() => finish(false), 6000);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });
  }

  function probeUrlFor(def) {
    if (def.id === 'carto') return 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/4/2.png';
    return 'https://a.tile.openstreetmap.org/3/4/2.png';
  }

  function tilesAllowed() {
    try {
      /* Dans un aperçu intégré (iframe), les tuiles externes sont souvent
         interdites : on reste sur le plan embarqué, sans aucune requête. */
      if (window.self !== window.top) return false;
      if (sessionStorage.getItem('transit_tiles_blocked')) return false;
    } catch (err) {
      return false;
    }
    return true;
  }

  function buildChain(preferredId) {
    const local = BASE_LAYERS.find((item) => item.local);
    const raster = BASE_LAYERS.filter((item) => !item.local);
    if (preferredId === 'local') return [local];
    const preferred = raster.find((item) => item.id === preferredId);
    const order = preferred ? [preferred, ...raster.filter((item) => item !== preferred)] : raster;
    if (!preferred && !tilesAllowed()) return [local];
    return [...order, local];
  }

  function attachStreetBase(map, container) {
    let layer = null;
    let dead = false;
    let destroyed = false;
    let watchdog = null;
    let chain = buildChain(preferredBaseId());
    let pos = 0;

    const badge = document.createElement('div');
    badge.className = 'map-source';
    badge.innerHTML =
      '<span class="map-source-label"></span>' +
      '<button type="button" class="map-retry" hidden>Réessayer</button>';
    container.appendChild(badge);
    const badgeLabel = badge.querySelector('.map-source-label');
    const retry = badge.querySelector('.map-retry');

    const control = document.createElement('div');
    control.className = 'map-basemap';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Fond de carte');
    control.innerHTML = BASE_LAYERS.map(
      (item) =>
        `<button type="button" data-base="${item.id}" title="${item.name} — gratuit" aria-pressed="false">${item.label}</button>`
    ).join('');
    container.appendChild(control);

    function setLabel(text) {
      badgeLabel.textContent = text;
    }

    function markOnline() {
      badge.classList.remove('is-offline');
      retry.hidden = true;
    }

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

    function markBlocked() {
      setLabel('Plan détaillé indisponible — plan embarqué affiché');
      badge.classList.add('is-offline');
      retry.hidden = false;
      try {
        sessionStorage.setItem('transit_tiles_blocked', '1');
      } catch (err) {
        /* stockage indisponible */
      }
    }

    function advance() {
      if (pos + 1 < chain.length) start(pos + 1);
      else {
        dead = true;
        markBlocked();
      }
    }

    function addTiles(def) {
      const current = L.tileLayer(def.url, { ...def.options, attribution: def.attribution });
      layer = current;
      let errors = 0;
      let loaded = 0;
      const active = () => layer === current;

      current.on('tileload', () => {
        if (!active()) return;
        loaded += 1;
        markOnline();
        clearWatchdog();
      });

      current.on('tileerror', () => {
        if (!active() || loaded > 0 || dead) return;
        errors += 1;
        if (errors < TILE_ERROR_LIMIT) return;
        stopLayer();
        advance();
      });

      current.addTo(map);
      markOnline();

      watchdog = setTimeout(() => {
        watchdog = null;
        if (!active() || loaded > 0 || dead) return;
        stopLayer();
        advance();
      }, TILE_TIMEOUT_MS);
    }

    function start(nextPos) {
      clearWatchdog();
      stopLayer();
      dead = false;
      pos = nextPos;
      const def = chain[pos];
      syncControl(def.id);

      if (def.local) {
        if (pos > 0) {
          /* Tous les plans détaillés ont échoué : on reste sur le plan embarqué
             et on l’explique, sans laisser la carte vide. */
          dead = true;
          markBlocked();
        } else {
          markOnline();
          setLabel('Plan embarqué · Natural Earth');
        }
        return;
      }

      setLabel(`Plan de rues · ${def.name}`);
      probeTile(probeUrlFor(def)).then((available) => {
        if (destroyed || dead) return;
        if (!available) {
          advance();
          return;
        }
        addTiles(def);
      });
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
        /* stockage indisponible (navigation privée) */
      }
      start(0);
    });

    retry.addEventListener('click', () => {
      try {
        sessionStorage.removeItem('transit_tiles_blocked');
      } catch (err) {
        /* noop */
      }
      chain = buildChain('osm');
      start(0);
    });

    const onOnline = () => {
      if (!retry.hidden) {
        try {
          sessionStorage.removeItem('transit_tiles_blocked');
        } catch (err) {
          /* noop */
        }
        chain = buildChain('osm');
        start(0);
      }
    };
    window.addEventListener('online', onOnline);

    start(0);

    return {
      destroy() {
        destroyed = true;
        dead = true;
        window.removeEventListener('online', onOnline);
        clearWatchdog();
        stopLayer();
        badge.remove();
        control.remove();
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
    const local = addLocalBasemap(map, el);
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
        if (local) local.destroy();
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

  const GAZETTEER_URL = '/data/gazetteer.json';
  let gazetteerPromise = null;

  function loadGazetteer() {
    if (!gazetteerPromise) {
      gazetteerPromise = Promise.all([
        fetch(GAZETTEER_URL, { headers: { Accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : []))
          .catch(() => []),
        fetch(BASEMAP_FILES.cities, { headers: { Accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : []))
          .catch(() => []),
      ]).then(([gazetteer, cities]) => {
        /* Les villes du plan embarqué portent des noms français : elles enrichissent
           le répertoire GeoNames (noms locaux) pour les recherches en français. */
        const extra = (Array.isArray(cities) ? cities : []).map((city) => ({
          n: city.n,
          cc: '',
          country: city.c,
          lat: city.lat,
          lng: city.lng,
        }));
        return [...extra, ...(Array.isArray(gazetteer) ? gazetteer : [])];
      });
    }
    return gazetteerPromise;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function regionName(code) {
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || '';
      }
    } catch (err) {
      /* noop */
    }
    return '';
  }

  /* Recherche locale : même sans réseau, une ville suffit pour calculer la distance. */
  async function searchLocal(query) {
    const data = await loadGazetteer();
    if (!Array.isArray(data) || !data.length) return null;
    const normalized = normalizeText(query);
    if (!normalized) return null;
    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    const cityPart = parts[0] || '';
    const countryPart = parts[1] || '';
    let best = null;
    let bestScore = 0;
    for (const city of data) {
      const name = normalizeText(city.n);
      if (!name) continue;
      let score = 0;
      if (name === cityPart) score = 100;
      else if (name.startsWith(cityPart)) score = 80;
      else if (name.includes(cityPart)) score = 50;
      else if (cityPart.includes(name)) score = 20;
      if (!score) continue;
      if (countryPart) {
        const region = normalizeText(city.country || regionName(city.cc));
        if (region && (region.includes(countryPart) || countryPart.includes(region))) score += 30;
        else if (normalizeText(city.cc) === countryPart) score += 30;
      }
      if (score > bestScore) {
        bestScore = score;
        best = city;
      }
    }
    if (!best) return null;
    const country = best.country || regionName(best.cc);
    return {
      lat: best.lat,
      lng: best.lng,
      displayName: `${best.n}, ${country || best.cc}`,
      city: best.n,
      country,
      countryCode: best.cc,
      name: best.n,
    };
  }

  async function reverseLocal(lat, lng) {
    const data = await loadGazetteer();
    let best = null;
    let bestKm = 80;
    for (const city of data) {
      const km = haversine({ lat, lng }, city);
      if (km < bestKm) {
        bestKm = km;
        best = city;
      }
    }
    if (!best) return null;
    const country = best.country || regionName(best.cc);
    return {
      lat,
      lng,
      displayName: `${best.n}, ${country || best.cc}`,
      city: best.n,
      country,
      countryCode: best.cc,
      name: best.n,
    };
  }

  /* Après un premier échec (403, proxy, réseau), on ne tente plus les services
     distants pendant la session : tout passe par le répertoire local. */
  let geoBlocked = false;
  try {
    geoBlocked = sessionStorage.getItem('transit_geo_blocked') === '1';
  } catch (err) {
    geoBlocked = false;
  }

  function rememberGeoBlocked() {
    geoBlocked = true;
    try {
      sessionStorage.setItem('transit_geo_blocked', '1');
    } catch (err) {
      /* stockage indisponible */
    }
  }

  async function search(query) {
    if (!geoBlocked) {
      try {
        const remote = await searchRemote(query);
        if (remote) return remote;
      } catch (err) {
        rememberGeoBlocked();
        const local = await searchLocal(query);
        if (local) return local;
        throw new Error('offline-search');
      }
    }
    return searchLocal(query);
  }

  async function reverse(lat, lng) {
    if (!geoBlocked) {
      try {
        const remote = await reverseRemote(lat, lng);
        if (remote) return remote;
      } catch (err) {
        rememberGeoBlocked();
      }
    }
    const local = await reverseLocal(lat, lng);
    if (local) return local;
    return {
      lat,
      lng,
      displayName: 'Votre position',
      city: '',
      country: '',
      countryCode: '',
      name: 'Votre position',
    };
  }

  async function searchRemote(query) {
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

  async function reverseRemote(lat, lng) {
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
    if (geoBlocked) throw new Error('network');
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
    let response;
    try {
      response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
    } catch (err) {
      rememberGeoBlocked();
      throw new Error('network');
    }
    if (!response.ok) {
      rememberGeoBlocked();
      throw new Error('network');
    }
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
