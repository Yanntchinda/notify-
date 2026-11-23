'use strict';

/*
 * Test d'intégration de la couche Supabase.
 *
 * Aucun projet Supabase nécessaire : un serveur HTTP local imite PostgREST,
 * GoTrue (auth) et les appels rpc(). L'application est chargée dans jsdom avec
 * une configuration pointant vers ce serveur : on vérifie que tout le parcours
 * (contenu public, inscription, demande de devis, administration) fonctionne
 * sans le serveur Node.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PORT = Number(process.env.MOCK_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC = path.join(__dirname, '..', 'public');

/* ------------------------------- Données -------------------------------- */

const db = {
  profiles: [{ id: 'u-admin', name: 'Admin', email: 'admin@transit.app', phone: '', role: 'admin', language: 'fr', active: true, created_at: '2026-01-01T00:00:00Z' }],
  vehicles: [],
  container_refs: [],
  ports: [
    { id: 'p-douala', name: 'Port de Douala', city: 'Douala', country: 'Cameroun', country_code: 'CM', role: 'both', lat: 4.05, lng: 9.7 },
    { id: 'p-marseille', name: 'Port de Marseille', city: 'Marseille', country: 'France', country_code: 'FR', role: 'both', lat: 43.3, lng: 5.36 },
  ],
  departures: [
    { id: 'd1', ship: 'MV Transit', from_port_id: 'p-douala', to_port_id: 'p-marseille', departure_date: '2099-01-15', deposit_deadline: '2098-12-20', status: 'open', note: '', created_at: '2026-01-01T00:00:00Z' },
  ],
  containers: [
    { id: 'c20', name: 'Conteneur 20 pieds', short_name: '20 ft', description: 'Standard', dimensions: '6,06 × 2,44 × 2,59 m', volume: '33 m³', image: '', active: true },
  ],
  sliders: [
    { id: 's1', src: '/img/1.jpg', caption: 'Slide 1', sub: '', order: 1, active: true },
    { id: 's2', src: '/img/2.jpg', caption: 'Slide 2', sub: '', order: 2, active: true },
  ],
  services: [
    { id: 'sv1', name: 'Dédouanement', icon: 'doc', description: 'Formalités', order: 1, active: true },
  ],
  quotes: [],
  notifications: [],
};

const passwords = new Map([['admin@transit.app', 'admin123']]);
const sessions = new Map();
let counter = 0;

const send = (res, status, payload, headers = {}) => {
  const body = payload === null || payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
};

/* --------------------------- Filtres PostgREST -------------------------- */

function match(row, params) {
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    const [op, ...rest] = String(raw).split('.');
    const value = rest.join('.');
    const cell = row[key];
    if (op === 'eq' && String(cell) !== value) return false;
    if (op === 'neq' && String(cell) === value) return false;
    if (op === 'is') {
      if (value === 'null' ? cell !== null : cell !== value) return false;
    }
    if (op === 'gte' && !(String(cell) >= value)) return false;
    if (op === 'lte' && !(String(cell) <= value)) return false;
    if (op === 'in') {
      const list = value.replace(/^\(/, '').replace(/\)$/, '').split(',');
      if (!list.includes(String(cell))) return false;
    }
  }
  return true;
}

function query(table, params) {
  let rows = (db[table] || []).filter((row) => match(row, params));
  const order = params.get('order');
  if (order) {
    const [column, direction] = order.split('.');
    rows = rows.slice().sort((a, b) => {
      const left = a[column] == null ? '' : a[column];
      const right = b[column] == null ? '' : b[column];
      const compared = left > right ? 1 : left < right ? -1 : 0;
      return direction === 'desc' ? -compared : compared;
    });
  }
  const limit = params.get('limit');
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

/* ------------------------------- Serveur -------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  let body = {};
  const isJson = (req.headers['content-type'] || '').includes('application/json');
  if (raw.length && isJson) body = JSON.parse(raw.toString('utf8'));

  /* --- Storage (fichiers envoyés par l'admin) --- */
  if (url.pathname.startsWith('/storage/v1/object/uploads/')) {
    const name = url.pathname.split('/').pop();
    return send(res, 200, { Key: `uploads/${name}` });
  }

  /* Fichiers statiques */
  if (!url.pathname.startsWith('/rest/') && !url.pathname.startsWith('/auth/')) {
    const target = url.pathname === '/js/config.js'
      ? null
      : path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (url.pathname === '/js/config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end(`window.APP_CONFIG = ${JSON.stringify({
        supabaseUrl: BASE,
        supabaseAnonKey: 'anon-key',
        appUrl: BASE,
      })};`);
    }
    fs.readFile(target, (error, content) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        return res.end('<!doctype html><title>404</title>');
      }
      const type = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
      }[path.extname(target)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    });
    return;
  }

  /* --- Auth (GoTrue) --- */
  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const expected = passwords.get(String(body.email).toLowerCase());
      if (!expected || expected !== body.password) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'Identifiants incorrects' });
      }
      const profile = db.profiles.find((row) => row.email === body.email.toLowerCase());
      const token = `token-${++counter}`;
      sessions.set(token, profile.id);
      return send(res, 200, {
        access_token: token, refresh_token: `refresh-${counter}`, expires_in: 3600,
        token_type: 'bearer', user: { id: profile.id, email: profile.email },
      });
    }
    if (grant === 'refresh_token') {
      return send(res, 200, { access_token: 'token-refreshed', expires_in: 3600, token_type: 'bearer' });
    }
    return send(res, 400, { error: 'unsupported_grant_type' });
  }
  if (url.pathname === '/auth/v1/user') {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const id = sessions.get(token);
    if (!id) return send(res, 401, { message: 'Session expirée' });
    return send(res, 200, { id, email: (db.profiles.find((row) => row.id === id) || {}).email });
  }
  if (url.pathname === '/auth/v1/logout') return send(res, 204, null);

  /* --- Fonction RPC (submit_quote) --- */
  if (url.pathname === '/rest/v1/rpc/submit_quote') {
    const type = body.p_type;
    const prefix = { roro: 'RR', container: 'CT', service: 'SV' }[type] || 'QT';
    const contact = body.p_contact || {};
    if (!contact.name) return send(res, 400, { message: 'Le nom est obligatoire', code: 'P0001' });
    if (!contact.email && !contact.phone) return send(res, 400, { message: 'Indiquez un e-mail ou un numéro de téléphone', code: 'P0001' });
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const userId = sessions.get(token) || null;
    const row = {
      id: `q-${++counter}`,
      number: `${prefix}-2099-${String(counter).padStart(4, '0')}`,
      type, status: 'received', contact, payload: body.p_payload || {}, distance: body.p_distance,
      user_id: userId, admin_response: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    db.quotes.unshift(row);
    db.notifications.unshift({
      id: `n-${counter}`, user_id: null, kind: 'new_quote', title: `Nouvelle demande ${row.number}`,
      message: `${contact.name} — ${type}`, quote_id: row.id, read: false,
      created_at: new Date().toISOString(),
    });
    return send(res, 201, [row]);
  }

  /* --- PostgREST --- */
  const matchRest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (!matchRest) return send(res, 404, { message: 'Route introuvable' });
  const table = matchRest[1];
  if (!db[table]) return send(res, 404, { message: `Table ${table} introuvable` });

  const accept = req.headers.accept || '';
  const wantsObject = accept.includes('vnd.pgrst.object+json');

  if (req.method === 'GET') {
    const rows = query(table, url.searchParams);
    if (!wantsObject) return send(res, 200, rows);
    return rows.length ? send(res, 200, rows[0]) : send(res, 406, null);
  }
  if (req.method === 'POST') {
    const rows = (Array.isArray(body) ? body : [body]).map((item) => ({ ...item }));
    db[table].push(...rows);
    if (!(req.headers.prefer || '').includes('representation')) return send(res, 201, null);
    return send(res, 201, wantsObject ? rows[0] : rows);
  }
  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const rows = query(table, url.searchParams);
    if (req.method === 'DELETE') {
      db[table] = db[table].filter((row) => !rows.includes(row));
      return send(res, 200, null);
    }
    rows.forEach((row) => Object.assign(row, body));
    if (!(req.headers.prefer || '').includes('representation')) return send(res, 200, null);
    return send(res, 200, wantsObject ? rows[0] : rows);
  }
  return send(res, 405, { message: 'Méthode non autorisée' });
});

/* --------------------------------- Test --------------------------------- */

let passed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label} ${detail}`);
    process.exitCode = 1;
  }
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!/Not implemented/.test(error.message)) errors.push(`jsdom: ${error.message}`);
  });
  virtualConsole.on('error', (...args) => {
    const text = args.map(String).join(' ');
    if (!/Not implemented/.test(text)) errors.push(`console: ${text}`);
  });

  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = (target, options) => fetch(new URL(target, BASE).href, options);
      window.scrollTo = () => {};
    },
  });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const app = window.document.getElementById('app');
  console.log('\n— Chargement —');
  check('bundle Supabase chargé', typeof window.supabase?.createClient === 'function');
  check('couche API détectée', window.T?.apiSupabase?.configured() === true);
  check('page d’accueil rendue', app && app.innerHTML.length > 500, app ? '' : 'app vide');
  const visitorButton = window.document.getElementById('btn-visitor');
  if (visitorButton) visitorButton.click();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  check('contenu Supabase affiché (navire)', /MV Transit/.test(app.innerHTML));
  check('contenu Supabase affiché (port)', /Douala|Marseille/.test(app.innerHTML));

  const api = window.T.api;
  console.log('\n— Contenu public —');
  const content = await api.get('/api/content');
  check('/api/content', content.ports.length === 2 && content.departures.length === 1);
  check('/api/ports', (await api.get('/api/ports')).ports.length === 2);

  console.log('\n— Demande de devis (visiteur) —');
  const created = await api.post('/api/quotes', {
    type: 'roro',
    contact: { name: 'Client Test', email: 'client@test.cm', phone: '+237600000000' },
    payload: { vehicle: { brand: 'Toyota', model: 'Hilux' }, fromPortId: 'p-douala', toPortId: 'p-marseille' },
    distance: { km: 123.4, mode: 'road' },
  });
  check('numéro généré', /^RR-\d{4}-\d{4}$/.test(created.number), created.number);
  check('demande enregistrée', db.quotes.length === 1 && db.quotes[0].contact.name === 'Client Test');
  check('notification admin créée', db.notifications.length === 1);
  try {
    await api.post('/api/quotes', { type: 'roro', contact: { name: '', email: '' }, payload: {} });
    check('validation refusée', false, 'aucune erreur levée');
  } catch (error) {
    check('validation refusée', error.message.length > 0, error.message);
  }

  console.log('\n— Authentification —');
  try {
    await api.post('/api/auth/login', { identifier: 'admin@transit.app', password: 'mauvais' });
    check('mot de passe erroné refusé', false, 'aucune erreur levée');
  } catch (error) {
    check('mot de passe erroné refusé', error.status === 401, String(error.status));
  }
  const session = await api.post('/api/auth/login', { identifier: 'admin@transit.app', password: 'admin123' });
  check('connexion admin', session.user.role === 'admin');
  check('/api/auth/me', (await api.get('/api/auth/me')).user.email === 'admin@transit.app');

  console.log('\n— Administration —');
  const stats = await api.get('/api/admin/stats');
  check('/api/admin/stats', stats.stats.quotes.total === 1 && stats.recentQuotes.length === 1);
  const quotes = await api.get('/api/admin/quotes');
  check('/api/admin/quotes', quotes.quotes.length === 1 && quotes.quotes[0].number === created.number);
  check('/api/admin/departures', (await api.get('/api/admin/departures')).departures.length === 1);
  check('/api/admin/ports', (await api.get('/api/admin/ports')).ports.length === 2);
  check('/api/admin/notifications', (await api.get('/api/admin/notifications')).unread === 1);

  const responded = await api.post(`/api/quotes/${created.quote.id}/respond`, {
    price: '2 500 000 FCFA', message: 'Cotation valable 15 jours.',
  });
  check('réponse enregistrée', responded.quote.adminResponse?.price === '2 500 000 FCFA');
  check('statut cotée', responded.quote.status === 'quoted');

  const updated = await api.put('/api/admin/departures/d1', {
    ship: 'MV Transit II', fromPortId: 'p-douala', toPortId: 'p-marseille',
    departureDate: '2099-02-01', depositDeadline: '2099-01-20', status: 'open', note: '',
  });
  check('départ modifié', updated.departure.ship === 'MV Transit II');

  const uploaded = await api.post('/api/admin/upload', {
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
  });
  check('upload traité', uploaded.ok === true && typeof uploaded.url === 'string', uploaded.url || '');

  console.log('\n— Espace client —');
  await api.post('/api/auth/logout');
  try {
    await api.get('/api/account/quotes');
    check('accès refusé sans session', false, 'aucune erreur levée');
  } catch (error) {
    check('accès refusé sans session', error.status === 401, String(error.status));
  }

  console.log(`\n${passed} vérifications réussies${errors.length ? ` — ${errors.length} erreur(s) jsdom` : ''}`);
  errors.forEach((error) => console.log(`  ! ${error}`));
  if (errors.length) process.exitCode = 1;

  server.close();
  window.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
