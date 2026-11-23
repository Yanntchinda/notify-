'use strict';

/* Test d'intégration de l'API (à lancer serveur démarré). */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
let passed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`✓ ${message}`);
  } else {
    failures.push(message);
    console.log(`✗ ${message}`);
  }
}

function client() {
  let cookie = '';
  return {
    async request(method, url, body) {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (cookie) headers.cookie = cookie;
      const response = await fetch(BASE + url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
      if (setCookie.length) cookie = setCookie.map((item) => item.split(';')[0]).join('; ');
      let data = null;
      try {
        data = await response.json();
      } catch (err) {
        data = null;
      }
      return { status: response.status, data };
    },
    get(url) {
      return this.request('GET', url);
    },
    post(url, body) {
      return this.request('POST', url, body);
    },
    put(url, body) {
      return this.request('PUT', url, body);
    },
    patch(url, body) {
      return this.request('PATCH', url, body);
    },
    del(url) {
      return this.request('DELETE', url);
    },
  };
}

async function main() {
  const anonymous = client();

  /* Contenu public */
  const content = await anonymous.get('/api/content');
  assert(content.status === 200 && content.data.sliders.length === 5, 'Contenu public : 5 images de slider');
  assert(content.data.departures.length >= 5, 'Contenu public : prochains départs triés');
  assert(content.data.ports.length === 23, 'Contenu public : 23 ports');
  assert(content.data.containers.length === 3 && content.data.services.length === 4, 'Catalogue conteneurs et services');

  /* Cotations visiteur */
  const roro = await anonymous.post('/api/quotes', {
    type: 'roro',
    contact: { name: 'API Test Roro', phone: '+237600000002', email: 'api.roro@example.cm', city: 'Yaoundé', country: 'Cameroun' },
    payload: {
      departureId: 'dep_atlantic',
      fromPortId: 'port_douala',
      toPortId: 'port_antwerp',
      vehicle: { brand: 'Toyota', model: 'Hilux', vin: 'API123', type: 'Pick-up', year: 2022 },
      pickup: { city: 'Yaoundé', country: 'Cameroun', address: 'Bastos' },
    },
    distance: {
      km: 247.4,
      durationMin: 265,
      mode: 'road',
      from: { lat: 3.848, lng: 11.502, name: 'Yaoundé' },
      to: { lat: 4.0443, lng: 9.7005, name: 'Port de Douala' },
    },
  });
  assert(roro.status === 201 && /^RR-\d{4}-\d{4}$/.test(roro.data.number), `Cotation Ro-Ro créée (${roro.data.number})`);
  assert(roro.data.quote.distance && roro.data.quote.distance.km === 247.4, 'Distance enregistrée avec la demande');
  const roroId = roro.data.quote.id;
  const roroNumber = roro.data.number;

  const container = await anonymous.post('/api/quotes', {
    type: 'container',
    contact: { name: 'API Test Container', phone: '+237600000003', email: 'api.container@example.cm', city: 'Douala', country: 'Cameroun' },
    payload: { containerId: 'c40', quantity: 2, condition: 'neuf', delivery: { city: 'Douala', country: 'Cameroun' } },
    distance: { km: 12, durationMin: 30, mode: 'road', from: { lat: 4.05, lng: 9.7, name: 'Douala' }, to: { lat: 4.0443, lng: 9.7005, name: 'Port de Douala' } },
  });
  assert(container.status === 201 && container.data.quote.payload.containerName.includes('40'), 'Cotation conteneur créée');

  const service = await anonymous.post('/api/quotes', {
    type: 'service',
    contact: { name: 'API Test Service', phone: '+237600000004', email: 'api.service@example.cm', city: 'Douala', country: 'Cameroun' },
    payload: { serviceId: 'svc_dedouanement', details: 'Test API' },
    distance: null,
  });
  assert(service.status === 201 && /^SV-\d{4}-\d{4}$/.test(service.data.number), 'Cotation service créée');

  /* Validation */
  const invalid = await anonymous.post('/api/quotes', {
    type: 'roro',
    contact: { name: '', email: 'x' },
    payload: {},
  });
  assert(invalid.status === 400, 'Validation des demandes invalides');

  /* Inscription avec rattachement : une demande visiteur au même e-mail doit être rattachée */
  const suffix = String(Date.now()).slice(-6);
  const testEmail = `api.client+${suffix}@example.cm`;
  const visitorForAttach = await anonymous.post('/api/quotes', {
    type: 'roro',
    contact: { name: 'Futur Client', email: testEmail, city: 'Douala', country: 'Cameroun' },
    payload: {
      fromPortId: 'port_douala',
      toPortId: 'port_antwerp',
      vehicle: { brand: 'Peugeot', model: '3008', vin: 'ATTACH000000001', type: 'Voiture', year: 2021 },
      pickup: { city: 'Douala', country: 'Cameroun' },
    },
    distance: null,
  });
  assert(visitorForAttach.status === 201, 'Demande visiteur créée pour le rattachement');
  const register = await anonymous.post('/api/auth/register', {
    name: 'API Client',
    email: testEmail,
    phone: `+2376${suffix}`,
    password: 'secret123',
  });
  assert(register.status === 201 && register.data.user.role === 'client', 'Inscription client');
  assert(register.data.attachedQuotes === 1, 'Rattachement de la demande visiteur au nouveau compte');
  assert(register.data.user.vehicles.length === 1 && register.data.user.vehicles[0].vin === 'ATTACH000000001', 'Référence véhicule récupérée depuis la demande rattachée');
  const myQuotes = await anonymous.get('/api/account/quotes');
  assert(myQuotes.status === 200 && Array.isArray(myQuotes.data.quotes), 'Historique client accessible');

  /* Mot de passe oublié + réinitialisation */
  const forgot = await anonymous.post('/api/auth/forgot', { identifier: testEmail });
  assert(forgot.status === 200 && forgot.data.ok, 'Demande de réinitialisation acceptée');
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const createdUser = db.users.find((u) => u.email === testEmail);
  assert(createdUser && createdUser.resetToken, 'Jeton de réinitialisation généré');
  const reset = await anonymous.post('/api/auth/reset', { token: createdUser.resetToken, password: 'newpass123' });
  assert(reset.status === 200, 'Mot de passe réinitialisé');
  const relogin = await anonymous.post('/api/auth/login', { identifier: testEmail, password: 'newpass123' });
  assert(relogin.status === 200, 'Connexion avec le nouveau mot de passe');

  /* Accès refusés */
  const forbidden = await anonymous.get('/api/admin/stats');
  assert(forbidden.status === 403, 'Client non admin refusé sur l’administration');
  const otherQuote = await anonymous.get(`/api/quotes/${roroId}`);
  assert(otherQuote.status === 403, 'Accès à la demande d’un autre client refusé');

  /* Admin */
  const admin = client();
  const adminLogin = await admin.post('/api/auth/login', { identifier: 'admin@transit.app', password: 'admin123' });
  assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Connexion administrateur');
  const stats = await admin.get('/api/admin/stats');
  assert(stats.status === 200 && stats.data.stats.quotes.total >= 9, 'Statistiques administrateur');

  const filtered = await admin.get('/api/admin/quotes?type=roro&status=received');
  assert(filtered.status === 200 && filtered.data.quotes.every((q) => q.type === 'roro' && q.status === 'received'), 'Filtres des cotations');
  const searched = await admin.get(`/api/admin/quotes?q=${encodeURIComponent(roroNumber)}`);
  assert(searched.status === 200 && searched.data.quotes.some((q) => q.number === roroNumber), 'Recherche par numéro');

  const respond = await admin.post(`/api/quotes/${roroId}/respond`, {
    price: '2 900 000 FCFA',
    message: 'Cotation test API.',
    status: 'quoted',
  });
  assert(respond.status === 200 && respond.data.quote.status === 'quoted', 'Réponse administrateur enregistrée');
  const statusChange = await admin.patch(`/api/quotes/${roroId}/status`, { status: 'accepted' });
  assert(statusChange.status === 200 && statusChange.data.quote.status === 'accepted', 'Changement de statut');

  /* Ports CRUD */
  const newPort = await admin.post('/api/admin/ports', {
    name: 'Port Test', city: 'Ville Test', country: 'Pays Test', countryCode: 'PT', role: 'both', lat: 4.1, lng: 9.8,
  });
  assert(newPort.status === 201, 'Création d’un port');
  const portUpdate = await admin.put(`/api/admin/ports/${newPort.data.port.id}`, { name: 'Port Test Modifié', city: 'Ville', country: 'Pays Test', countryCode: 'PT', role: 'loading', lat: 4.2, lng: 9.9 });
  assert(portUpdate.status === 200 && portUpdate.data.port.name === 'Port Test Modifié', 'Modification d’un port');
  const badPort = await admin.post('/api/admin/ports', { name: '', country: '', lat: 999, lng: 0 });
  assert(badPort.status === 400, 'Validation des coordonnées de port');
  const portDelete = await admin.del(`/api/admin/ports/${newPort.data.port.id}`);
  assert(portDelete.status === 200, 'Suppression d’un port');

  /* Départs CRUD */
  const newDeparture = await admin.post('/api/admin/departures', {
    ship: 'MV Test', fromPortId: 'port_douala', toPortId: 'port_antwerp', departureDate: '2027-03-01', depositDeadline: '2027-02-25', status: 'open', note: 'Test',
  });
  assert(newDeparture.status === 201, 'Création d’un départ');
  const depUpdate = await admin.put(`/api/admin/departures/${newDeparture.data.departure.id}`, {
    ship: 'MV Test 2', fromPortId: 'port_douala', toPortId: 'port_rotterdam', departureDate: '2027-03-02', depositDeadline: '2027-02-26', status: 'full', note: 'Test',
  });
  assert(depUpdate.status === 200 && depUpdate.data.departure.ship === 'MV Test 2', 'Modification d’un départ');
  const depDelete = await admin.del(`/api/admin/departures/${newDeparture.data.departure.id}`);
  assert(depDelete.status === 200, 'Suppression d’un départ');

  /* Conteneurs CRUD */
  const newContainer = await admin.post('/api/admin/containers', {
    name: 'Conteneur Test', shortName: 'Test', description: 'Test', dimensions: '1 x 1', volume: '1 m³', image: '/img/containers/20ft.jpg', active: true,
  });
  assert(newContainer.status === 201, 'Création d’un type de conteneur');
  const ctUpdate = await admin.put(`/api/admin/containers/${newContainer.data.container.id}`, { name: 'Conteneur Test 2', description: 'Test 2' });
  assert(ctUpdate.status === 200 && ctUpdate.data.container.name === 'Conteneur Test 2', 'Modification d’un type de conteneur');
  const ctDelete = await admin.del(`/api/admin/containers/${newContainer.data.container.id}`);
  assert(ctDelete.status === 200, 'Suppression d’un type de conteneur');

  /* Slider : minimum 5, maximum 6 */
  const addSlider = await admin.post('/api/admin/sliders', { src: '/img/slider/slide2.jpg', caption: 'Test slider', sub: 'Test' });
  assert(addSlider.status === 201, 'Ajout d’une 6e image au slider');
  const tooMany = await admin.post('/api/admin/sliders', { src: '/img/slider/slide3.jpg', caption: 'Trop', sub: 'Trop' });
  assert(tooMany.status === 400, 'Maximum de 6 images respecté');
  const slidersNow = await admin.get('/api/admin/sliders');
  assert(slidersNow.data.sliders.length === 6, 'Slider à 6 images');
  const delSlider = await admin.del(`/api/admin/sliders/${addSlider.data.slider.id}`);
  assert(delSlider.status === 200, 'Suppression d’une image du slider');
  const slidersAfter = await admin.get('/api/admin/sliders');
  assert(slidersAfter.data.sliders.length === 5, 'Slider revenu à 5 images');
  const tooFew = await admin.del(`/api/admin/sliders/${slidersAfter.data.sliders[0].id}`);
  assert(tooFew.status === 400, 'Minimum de 5 images respecté');
  const reorder = await admin.post('/api/admin/sliders/reorder', { ids: slidersAfter.data.sliders.map((s) => s.id).reverse() });
  assert(reorder.status === 200 && reorder.data.sliders[0].id === slidersAfter.data.sliders[4].id, 'Réordonnancement du slider');

  /* Services CRUD */
  const newService = await admin.post('/api/admin/services', { name: 'Service Test', icon: '🧪', description: 'Test' });
  assert(newService.status === 201, 'Création d’un service');
  const svcUpdate = await admin.put(`/api/admin/services/${newService.data.service.id}`, { name: 'Service Test 2', description: 'Test 2' });
  assert(svcUpdate.status === 200, 'Modification d’un service');
  const svcDelete = await admin.del(`/api/admin/services/${newService.data.service.id}`);
  assert(svcDelete.status === 200, 'Suppression d’un service');

  /* Utilisateurs */
  const users = await admin.get('/api/admin/users');
  assert(users.status === 200 && users.data.users.length >= 3, 'Liste des utilisateurs');
  const testUser = users.data.users.find((u) => u.email === testEmail);
  const toggle = await admin.put(`/api/admin/users/${testUser.id}`, { active: false });
  assert(toggle.status === 200 && toggle.data.user.active === false, 'Désactivation d’un compte client');
  const toggleBack = await admin.put(`/api/admin/users/${testUser.id}`, { active: true });
  assert(toggleBack.status === 200, 'Réactivation d’un compte client');
  const selfDemote = await admin.put('/api/admin/users/user_admin', { role: 'client' });
  assert(selfDemote.status === 400, 'Protection du compte administrateur courant');

  /* Notifications */
  const notifications = await admin.get('/api/admin/notifications');
  assert(notifications.status === 200 && notifications.data.notifications.length > 0, 'Notifications administrateur');
  const readAll = await admin.post('/api/admin/notifications/read-all', {});
  assert(readAll.status === 200, 'Marquage des notifications');
  const upload = await admin.post('/api/admin/upload', {
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  });
  assert(upload.status === 201 && upload.data.url.startsWith('/uploads/'), 'Upload d’image');

  /* Sécurité admin sans session */
  const anon = client();
  const noAuth = await anon.get('/api/admin/departures');
  assert(noAuth.status === 401, 'Administration protégée sans session');

  console.log(`\n${passed} assertions réussies, ${failures.length} échec(s).`);
  if (failures.length) {
    for (const failure of failures) console.log(' -', failure);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Erreur inattendue :', error);
  process.exit(1);
});
