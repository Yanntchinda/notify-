'use strict';

/* Géolocalisation de l'application : recherche d'adresse, position inverse,
   distance jusqu'au port. Aucun fond de carte n'est chargé — l'interface
   n'affiche plus de carte, seulement des distances et des couloirs maritimes.
   Les services distants (Nominatim, OSRM) sont optionnels : au premier échec
   réseau, tout bascule sur le répertoire embarqué /data/gazetteer.json. */

window.T = window.T || {};

(function () {
  'use strict';

  const T = window.T;
  const CITIES_URL = '/data/cities.json';

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
        fetch(CITIES_URL, { headers: { Accept: 'application/json' } })
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


  T.geo = { search, reverse, route, haversine, nearestPort };
})();
