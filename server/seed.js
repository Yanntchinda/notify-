'use strict';

const db = require('./db');

function iso(dateStr) {
  return new Date(`${dateStr}T09:00:00Z`).toISOString();
}

function buildSeed() {
  const ports = [
    { id: 'port_douala', name: 'Port de Douala', city: 'Douala', country: 'Cameroun', countryCode: 'CM', role: 'loading', lat: 4.0443, lng: 9.7005 },
    { id: 'port_lagos', name: 'Port de Lagos (Apapa)', city: 'Lagos', country: 'Nigeria', countryCode: 'NG', role: 'loading', lat: 6.4478, lng: 3.3946 },
    { id: 'port_abidjan', name: "Port d'Abidjan", city: 'Abidjan', country: "Côte d'Ivoire", countryCode: 'CI', role: 'loading', lat: 5.3, lng: -4.0333 },
    { id: 'port_cotonou', name: 'Port de Cotonou', city: 'Cotonou', country: 'Bénin', countryCode: 'BJ', role: 'loading', lat: 6.3556, lng: 2.4264 },
    { id: 'port_lome', name: 'Port de Lomé', city: 'Lomé', country: 'Togo', countryCode: 'TG', role: 'loading', lat: 6.1319, lng: 1.2333 },
    { id: 'port_dakar', name: 'Port de Dakar', city: 'Dakar', country: 'Sénégal', countryCode: 'SN', role: 'loading', lat: 14.6928, lng: -17.4464 },
    { id: 'port_libreville', name: 'Port de Libreville', city: 'Libreville', country: 'Gabon', countryCode: 'GA', role: 'loading', lat: 0.3939, lng: 9.4526 },
    { id: 'port_tema', name: 'Port de Tema', city: 'Tema', country: 'Ghana', countryCode: 'GH', role: 'loading', lat: 5.6294, lng: 0.0094 },
    { id: 'port_conakry', name: 'Port de Conakry', city: 'Conakry', country: 'Guinée', countryCode: 'GN', role: 'loading', lat: 9.515, lng: -13.7122 },
    { id: 'port_matadi', name: 'Port de Matadi', city: 'Matadi', country: 'RD Congo', countryCode: 'CD', role: 'loading', lat: -5.8203, lng: 13.4496 },
    { id: 'port_antwerp', name: "Port d'Anvers", city: 'Anvers', country: 'Belgique', countryCode: 'BE', role: 'discharge', lat: 51.2616, lng: 4.4024 },
    { id: 'port_rotterdam', name: 'Port de Rotterdam', city: 'Rotterdam', country: 'Pays-Bas', countryCode: 'NL', role: 'discharge', lat: 51.9491, lng: 4.1376 },
    { id: 'port_lehavre', name: 'Port du Havre', city: 'Le Havre', country: 'France', countryCode: 'FR', role: 'discharge', lat: 49.4862, lng: 0.1077 },
    { id: 'port_marseille', name: 'Port de Marseille', city: 'Marseille', country: 'France', countryCode: 'FR', role: 'discharge', lat: 43.2964, lng: 5.3698 },
    { id: 'port_hamburg', name: 'Port de Hambourg', city: 'Hambourg', country: 'Allemagne', countryCode: 'DE', role: 'discharge', lat: 53.5413, lng: 9.9844 },
    { id: 'port_newark', name: 'Port de Newark', city: 'Newark', country: 'États-Unis', countryCode: 'US', role: 'discharge', lat: 40.6742, lng: -74.0465 },
    { id: 'port_houston', name: 'Port de Houston', city: 'Houston', country: 'États-Unis', countryCode: 'US', role: 'discharge', lat: 29.7384, lng: -95.0052 },
    { id: 'port_jebelali', name: 'Port de Jebel Ali', city: 'Dubaï', country: 'Émirats arabes unis', countryCode: 'AE', role: 'discharge', lat: 25.0107, lng: 55.0627 },
    { id: 'port_shanghai', name: 'Port de Shanghai', city: 'Shanghai', country: 'Chine', countryCode: 'CN', role: 'discharge', lat: 31.2304, lng: 121.4737 },
    { id: 'port_singapore', name: 'Port de Singapour', city: 'Singapour', country: 'Singapour', countryCode: 'SG', role: 'discharge', lat: 1.2903, lng: 103.852 },
    { id: 'port_montreal', name: 'Port de Montréal', city: 'Montréal', country: 'Canada', countryCode: 'CA', role: 'discharge', lat: 45.5, lng: -73.5667 },
    { id: 'port_istanbul', name: "Port d'Ambarli", city: 'Istanbul', country: 'Turquie', countryCode: 'TR', role: 'discharge', lat: 40.9755, lng: 28.7333 },
    { id: 'port_durban', name: 'Port de Durban', city: 'Durban', country: 'Afrique du Sud', countryCode: 'ZA', role: 'discharge', lat: -29.8745, lng: 31.0318 },
  ];

  const departures = [
    { id: 'dep_sahara', ship: 'MV Sahara Wind', fromPortId: 'port_dakar', toPortId: 'port_newark', departureDate: '2026-11-29', depositDeadline: '2026-11-26', status: 'open', note: 'Véhicules particuliers et utilitaires' },
    { id: 'dep_atlantic', ship: 'MV Atlantic Star', fromPortId: 'port_douala', toPortId: 'port_antwerp', departureDate: '2026-12-05', depositDeadline: '2026-12-01', status: 'open', note: 'Voitures, 4x4 et engins' },
    { id: 'dep_gulf', ship: 'MV Gulf Horizon', fromPortId: 'port_lagos', toPortId: 'port_rotterdam', departureDate: '2026-12-12', depositDeadline: '2026-12-08', status: 'open', note: 'Tous véhicules' },
    { id: 'dep_seme', ship: 'MV Seme Express', fromPortId: 'port_cotonou', toPortId: 'port_marseille', departureDate: '2026-12-19', depositDeadline: '2026-12-15', status: 'open', note: 'Véhicules et machinerie' },
    { id: 'dep_abidjan', ship: 'MV Abidjan Bridge', fromPortId: 'port_abidjan', toPortId: 'port_hamburg', departureDate: '2026-12-27', depositDeadline: '2026-12-22', status: 'full', note: 'Complet — liste d’attente' },
    { id: 'dep_kribi', ship: 'MV Kribi Star', fromPortId: 'port_douala', toPortId: 'port_lehavre', departureDate: '2027-01-09', depositDeadline: '2027-01-05', status: 'open', note: 'Ro-Ro classique' },
    { id: 'dep_ocean', ship: 'MV Ocean Pride', fromPortId: 'port_douala', toPortId: 'port_jebelali', departureDate: '2027-01-23', depositDeadline: '2027-01-18', status: 'open', note: 'Véhicules et conteneurs' },
    { id: 'dep_tema', ship: 'MV Tema Glory', fromPortId: 'port_tema', toPortId: 'port_shanghai', departureDate: '2027-02-06', depositDeadline: '2027-02-01', status: 'open', note: 'Fret et véhicules' },
    { id: 'dep_lome', ship: 'MV Lomé Mercury', fromPortId: 'port_lome', toPortId: 'port_rotterdam', departureDate: '2027-02-20', depositDeadline: '2027-02-15', status: 'open', note: 'Véhicules et engins' },
    { id: 'dep_matadi', ship: 'MV Matadi Explorer', fromPortId: 'port_matadi', toPortId: 'port_marseille', departureDate: '2026-11-15', depositDeadline: '2026-11-11', status: 'departed', note: 'Départ effectué' },
  ].map((d) => ({ ...d, createdAt: iso('2026-11-01') }));

  const containers = [
    {
      id: 'c20',
      name: 'Conteneur 20 pieds',
      shortName: '20 ft',
      description: 'Idéal pour un déménagement, du stockage compact ou une petite expédition. Fermé, sécurisé et facile à transporter.',
      dimensions: '6,06 × 2,44 × 2,59 m',
      volume: '33,2 m³',
      image: '/img/containers/20ft.jpg',
      active: true,
    },
    {
      id: 'c40',
      name: 'Conteneur 40 pieds',
      shortName: '40 ft',
      description: 'Le format le plus demandé pour le fret et le stockage. Deux fois la capacité d’un 20 pieds, avec une surface au sol maximale.',
      dimensions: '12,19 × 2,44 × 2,59 m',
      volume: '67,7 m³',
      image: '/img/containers/40ft.jpg',
      active: true,
    },
    {
      id: 'c40hc',
      name: 'Conteneur 40 pieds High Cube',
      shortName: '40 ft HC',
      description: 'Plus haut de 30 cm qu’un conteneur standard, il offre un volume accru pour les marchandises volumineuses.',
      dimensions: '12,19 × 2,44 × 2,90 m',
      volume: '76,4 m³',
      image: '/img/containers/40ft-hc.jpg',
      active: true,
    },
  ];

  const services = [
    { id: 'svc_dedouanement', name: 'Dédouanement & transit', icon: '🛃', description: 'Prise en charge des formalités douanières à l’import comme à l’export : documents, déclarations, suivi.', active: true },
    { id: 'svc_routier', name: 'Transport routier', icon: '🚛', description: 'Enlèvement de votre véhicule ou conteneur et acheminement jusqu’au port, partout en Afrique de l’Ouest et du Centre.', active: true },
    { id: 'svc_assurance', name: 'Assurance cargo', icon: '🛡️', description: 'Assurance ad valorem pour vos véhicules et marchandises, de la prise en charge jusqu’à la livraison.', active: true },
    { id: 'svc_groupage', name: 'Groupage & consolidation', icon: '📦', description: 'Regroupement de plusieurs expéditions pour réduire les coûts et optimiser le remplissage.', active: true },
  ];

  const sliders = [
    { id: 'slide1', src: '/img/slider/slide1.jpg', caption: 'Votre véhicule, pris en charge jusqu’au port', sub: 'Ro-Ro régulier vers l’Europe, l’Asie et les Amériques', order: 1 },
    { id: 'slide2', src: '/img/slider/slide2.jpg', caption: 'Conteneurs neufs et d’occasion', sub: 'Achat et livraison, sur simple demande de prix', order: 2 },
    { id: 'slide3', src: '/img/slider/slide3.jpg', caption: 'Des départs réguliers', sub: 'Consultez les prochaines traversées et réservez votre place', order: 3 },
    { id: 'slide4', src: '/img/slider/slide4.jpg', caption: 'De votre ville au port', sub: 'Distance et itinéraire calculés automatiquement', order: 4 },
    { id: 'slide5', src: '/img/slider/slide5.jpg', caption: 'Un accompagnement de bout en bout', sub: 'Dédouanement, transport routier et assurance cargo', order: 5 },
  ];

  const users = [
    {
      id: 'user_admin',
      name: 'Administrateur',
      email: 'admin@transit.app',
      phone: '+237600000001',
      passwordHash: db.hashPassword('admin123'),
      role: 'admin',
      active: true,
      language: 'fr',
      vehicles: [],
      containers: [],
      createdAt: iso('2026-01-10'),
    },
    {
      id: 'user_client',
      name: 'Awa Ngono',
      email: 'client@transit.app',
      phone: '+237699887766',
      passwordHash: db.hashPassword('client123'),
      role: 'client',
      active: true,
      language: 'fr',
      vehicles: [
        { id: 'veh_awa_1', brand: 'Toyota', model: 'Hilux', vin: 'MR0AB3CD200000001', type: 'Pick-up', year: 2021 },
      ],
      containers: [
        { id: 'ctr_awa_1', type: 'Conteneur 20 pieds', condition: 'occasion', notes: 'Livraison Douala' },
      ],
      createdAt: iso('2026-02-02'),
    },
  ];

  const quotes = [
    {
      id: 'q_seed_1',
      number: 'RR-2026-0001',
      type: 'roro',
      contact: { name: 'Jean-Paul Mbarga', phone: '+237677001122', email: 'jp.mbarga@gmail.com', city: 'Yaoundé', country: 'Cameroun' },
      payload: {
        departureId: 'dep_atlantic',
        fromPortId: 'port_douala',
        toPortId: 'port_antwerp',
        ship: 'MV Atlantic Star',
        vehicle: { brand: 'Toyota', model: 'Land Cruiser', vin: 'JTEAB3CD300000001', type: '4x4', year: 2019 },
        pickup: { city: 'Yaoundé', country: 'Cameroun', address: 'Bastos, Yaoundé' },
      },
      distance: { km: 247, durationMin: 265, mode: 'road', from: { lat: 3.848, lng: 11.502, name: 'Yaoundé' }, to: { lat: 4.0443, lng: 9.7005, name: 'Port de Douala' } },
      userId: null,
      status: 'quoted',
      adminResponse: { price: '2 450 000 FCFA', message: 'Cotation pour un Land Cruiser 2019, Douala → Anvers, départ du 5 décembre. Le prix inclut le transport routier Yaoundé → Douala, le fret maritime et les formalités portuaires.', respondedAt: iso('2026-11-18') },
      createdAt: iso('2026-11-17'),
      updatedAt: iso('2026-11-18'),
    },
    {
      id: 'q_seed_2',
      number: 'CT-2026-0001',
      type: 'container',
      contact: { name: 'Fatou Ndiaye', phone: '+221771234567', email: 'fatou.ndiaye@example.sn', city: 'Dakar', country: 'Sénégal' },
      payload: {
        containerId: 'c40hc',
        containerName: 'Conteneur 40 pieds High Cube',
        quantity: 2,
        condition: 'neuf',
        delivery: { city: 'Dakar', country: 'Sénégal', address: 'Almadies, Dakar' },
        usage: 'Stockage de marchandises',
        desiredDate: '2026-12-15',
      },
      distance: { km: 18, durationMin: 35, mode: 'road', from: { lat: 14.7407, lng: -17.5102, name: 'Almadies, Dakar' }, to: { lat: 14.6928, lng: -17.4464, name: 'Port de Dakar' } },
      userId: null,
      status: 'received',
      adminResponse: null,
      createdAt: iso('2026-11-20'),
      updatedAt: iso('2026-11-20'),
    },
    {
      id: 'q_seed_3',
      number: 'SV-2026-0001',
      type: 'service',
      contact: { name: 'Kofi Mensah', phone: '+233244556677', email: 'kofi.mensah@example.gh', city: 'Tema', country: 'Ghana' },
      payload: {
        serviceId: 'svc_dedouanement',
        serviceName: 'Dédouanement & transit',
        city: 'Tema',
        country: 'Ghana',
        details: 'Déclaration d’un véhicule importé d’Allemagne. Merci de me communiquer les pièces nécessaires.',
      },
      distance: null,
      userId: null,
      status: 'processing',
      adminResponse: null,
      createdAt: iso('2026-11-21'),
      updatedAt: iso('2026-11-22'),
    },
    {
      id: 'q_seed_4',
      number: 'RR-2026-0002',
      type: 'roro',
      contact: { name: 'Awa Ngono', phone: '+237699887766', email: 'client@transit.app', city: 'Douala', country: 'Cameroun' },
      payload: {
        departureId: 'dep_atlantic',
        fromPortId: 'port_douala',
        toPortId: 'port_antwerp',
        ship: 'MV Atlantic Star',
        vehicle: { brand: 'Toyota', model: 'Hilux', vin: 'MR0AB3CD200000001', type: 'Pick-up', year: 2021 },
        pickup: { city: 'Douala', country: 'Cameroun', address: 'Akwa, Douala' },
      },
      distance: { km: 6, durationMin: 18, mode: 'road', from: { lat: 4.0505, lng: 9.6965, name: 'Akwa, Douala' }, to: { lat: 4.0443, lng: 9.7005, name: 'Port de Douala' } },
      userId: 'user_client',
      status: 'accepted',
      adminResponse: { price: '1 980 000 FCFA', message: 'Cotation confirmée pour le Hilux 2021. Nous vous recontactons pour l’enlèvement.', respondedAt: iso('2026-11-19') },
      createdAt: iso('2026-11-16'),
      updatedAt: iso('2026-11-19'),
    },
    {
      id: 'q_seed_5',
      number: 'CT-2026-0002',
      type: 'container',
      contact: { name: 'Awa Ngono', phone: '+237699887766', email: 'client@transit.app', city: 'Douala', country: 'Cameroun' },
      payload: {
        containerId: 'c20',
        containerName: 'Conteneur 20 pieds',
        quantity: 1,
        condition: 'occasion',
        delivery: { city: 'Douala', country: 'Cameroun', address: 'Bonabéri, Douala' },
        usage: 'Stockage',
        desiredDate: '2026-12-01',
      },
      distance: { km: 9, durationMin: 25, mode: 'road', from: { lat: 4.0705, lng: 9.6695, name: 'Bonabéri, Douala' }, to: { lat: 4.0443, lng: 9.7005, name: 'Port de Douala' } },
      userId: 'user_client',
      status: 'refused',
      adminResponse: { price: '', message: 'Nous n’avons plus de 20 pieds d’occasion disponibles avant janvier. Nous vous proposons un 20 pieds neuf ou un 40 pieds.', respondedAt: iso('2026-11-17') },
      createdAt: iso('2026-11-15'),
      updatedAt: iso('2026-11-17'),
    },
    {
      id: 'q_seed_6',
      number: 'RR-2026-0003',
      type: 'roro',
      contact: { name: 'Ibrahim Sow', phone: '+224621234567', email: 'ibrahim.sow@example.gn', city: 'Conakry', country: 'Guinée' },
      payload: {
        departureId: 'dep_seme',
        fromPortId: 'port_conakry',
        toPortId: 'port_marseille',
        ship: 'MV Seme Express',
        vehicle: { brand: 'Mercedes-Benz', model: 'Sprinter', vin: 'WDB906CD300000002', type: 'Utilitaire', year: 2018 },
        pickup: { city: 'Conakry', country: 'Guinée', address: 'Kaloum, Conakry' },
      },
      distance: { km: 4, durationMin: 12, mode: 'road', from: { lat: 9.515, lng: -13.7122, name: 'Kaloum, Conakry' }, to: { lat: 9.515, lng: -13.7122, name: 'Port de Conakry' } },
      userId: null,
      status: 'received',
      adminResponse: null,
      createdAt: iso('2026-11-23'),
      updatedAt: iso('2026-11-23'),
    },
  ];

  const notifications = [
    {
      id: 'notif_1',
      userId: null,
      kind: 'new_quote',
      title: 'Nouvelle demande RR-2026-0003',
      message: 'Ibrahim Sow — Ro-Ro, Conakry → Marseille',
      quoteId: 'q_seed_6',
      read: false,
      createdAt: iso('2026-11-23'),
    },
    {
      id: 'notif_2',
      userId: null,
      kind: 'new_quote',
      title: 'Nouvelle demande CT-2026-0001',
      message: 'Fatou Ndiaye — Conteneur, 2 × 40 ft HC',
      quoteId: 'q_seed_2',
      read: false,
      createdAt: iso('2026-11-20'),
    },
    {
      id: 'notif_3',
      userId: 'user_client',
      kind: 'quote_response',
      title: 'Réponse à votre demande RR-2026-0002',
      message: 'Votre cotation a été acceptée.',
      quoteId: 'q_seed_4',
      read: true,
      createdAt: iso('2026-11-19'),
    },
  ];

  return {
    users,
    sessions: [],
    ports,
    departures,
    containers,
    sliders,
    services,
    quotes,
    notifications,
    counters: { roro: 3, container: 2, service: 1 },
    meta: { createdAt: new Date().toISOString(), seededAt: new Date().toISOString(), version: 1 },
  };
}

function seedIfEmpty() {
  const current = db.load();
  if (current.users.length || current.ports.length) return false;
  const seed = buildSeed();
  const data = db.load();
  Object.assign(data, seed);
  db.save();
  return true;
}

function resetAndSeed() {
  const seed = buildSeed();
  const data = db.load();
  Object.assign(data, seed);
  db.save();
  return true;
}

module.exports = { seedIfEmpty, resetAndSeed, buildSeed };
