'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const db = require('./db');
const { seedIfEmpty } = require('./seed');
const mailer = require('./mailer');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'transit_session';
const SESSION_DAYS = 30;
const VALID_QUOTE_STATUSES = ['received', 'processing', 'quoted', 'accepted', 'refused'];
const VALID_DEPARTURE_STATUSES = ['open', 'full', 'departed'];
const VALID_PORT_ROLES = ['loading', 'discharge', 'both'];
const QUOTE_STATUS_LABELS = {
  received: 'Reçue',
  processing: 'En cours de traitement',
  quoted: 'Cotation envoyée',
  accepted: 'Acceptée',
  refused: 'Refusée',
};

app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  setHeaders(res, filePath) {
    const fresh = /\.(html|webmanifest|js|css)$/.test(filePath);
    res.setHeader('Cache-Control', fresh ? 'no-cache' : 'public, max-age=604800');
  },
}));

const now = () => new Date().toISOString();
const str = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
const bad = (res, message, code = 400) => res.status(code).json({ ok: false, message });

function isSecure(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function createSession(req, res, userId) {
  const data = db.load();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  data.sessions = data.sessions.filter((s) => s.expiresAt > Date.now());
  data.sessions.push({ token, userId, createdAt: now(), expiresAt });
  db.save();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(req),
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
}

function destroySession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const data = db.load();
    data.sessions = data.sessions.filter((s) => s.token !== token);
    db.save();
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

app.use((req, res, next) => {
  req.user = null;
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const data = db.load();
    const session = data.sessions.find((s) => s.token === token && s.expiresAt > Date.now());
    if (session) {
      req.user = data.users.find((u) => u.id === session.userId && u.active) || null;
    }
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return bad(res, 'Authentification requise', 401);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return bad(res, 'Authentification requise', 401);
  if (req.user.role !== 'admin') return bad(res, 'Accès administrateur requis', 403);
  next();
}

function pushNotification(userId, kind, title, message, quoteId = null) {
  const data = db.load();
  data.notifications.unshift({
    id: db.uid('notif'),
    userId: userId || null,
    kind,
    title,
    message,
    quoteId,
    read: false,
    createdAt: now(),
  });
  if (data.notifications.length > 500) data.notifications.length = 500;
}

/* ---------------------------------- Auth --------------------------------- */

app.get('/api/auth/me', (req, res) => {
  res.json({ user: db.publicUser(req.user) });
});

app.post('/api/auth/register', (req, res) => {
  const data = db.load();
  const name = str(req.body.name, 80);
  const email = db.normalizeEmail(req.body.email);
  const phone = db.normalizePhone(req.body.phone);
  const password = String(req.body.password || '');

  if (!name) return bad(res, 'Le nom est obligatoire');
  if (!email && !phone) return bad(res, 'Indiquez un e-mail ou un numéro de téléphone');
  if (email && !isEmail(email)) return bad(res, 'Adresse e-mail invalide');
  if (phone && phone.replace(/\D/g, '').length < 8) return bad(res, 'Numéro de téléphone invalide');
  if (password.length < 6) return bad(res, 'Le mot de passe doit contenir au moins 6 caractères');
  if (email && data.users.some((u) => u.email === email)) return bad(res, 'Un compte existe déjà avec cet e-mail');
  if (phone && data.users.some((u) => u.phone === phone)) return bad(res, 'Un compte existe déjà avec ce numéro');

  const user = {
    id: db.uid('user'),
    name,
    email,
    phone,
    passwordHash: db.hashPassword(password),
    role: 'client',
    active: true,
    language: 'fr',
    vehicles: [],
    containers: [],
    createdAt: now(),
  };
  data.users.push(user);

  let attached = 0;
  for (const quote of data.quotes) {
    if (quote.userId) continue;
    const matches =
      (email && quote.contact && quote.contact.email === email) ||
      (phone && quote.contact && quote.contact.phone === phone);
    if (matches) {
      quote.userId = user.id;
      saveRefsFromQuote(user, quote.type, quote.payload);
      attached += 1;
    }
  }
  createSession(req, res, user.id);
  db.save();
  res.status(201).json({ ok: true, user: db.publicUser(user), attachedQuotes: attached });
});

app.post('/api/auth/login', (req, res) => {
  const data = db.load();
  const identifier = str(req.body.identifier, 120);
  const password = String(req.body.password || '');
  if (!identifier || !password) return bad(res, 'Identifiant et mot de passe requis');

  const isEmailAddress = isEmail(identifier);
  const email = isEmailAddress ? db.normalizeEmail(identifier) : '';
  const phone = !isEmailAddress ? db.normalizePhone(identifier) : '';
  const user = data.users.find((u) => (email && u.email === email) || (phone && u.phone === phone));
  if (!user || !db.verifyPassword(password, user.passwordHash)) {
    return bad(res, 'Identifiant ou mot de passe incorrect', 401);
  }
  if (!user.active) return bad(res, 'Ce compte a été désactivé. Contactez l’administrateur.', 403);
  createSession(req, res, user.id);
  res.json({ ok: true, user: db.publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/forgot', (req, res) => {
  const data = db.load();
  const identifier = str(req.body.identifier, 120);
  const isEmailAddress = isEmail(identifier);
  const email = isEmailAddress ? db.normalizeEmail(identifier) : '';
  const phone = !isEmailAddress ? db.normalizePhone(identifier) : '';
  const user = data.users.find((u) => (email && u.email === email) || (phone && u.phone === phone));
  if (user && user.email) {
    const token = crypto.randomBytes(24).toString('hex');
    user.resetToken = token;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${base}/#/reset?token=${token}`;
    mailer.sendPasswordReset(user, resetUrl).catch(() => {});
    pushNotification(null, 'password_reset', 'Demande de réinitialisation', `${user.name} (${user.email}) a demandé un nouveau mot de passe.`);
    db.save();
  }
  res.json({ ok: true, message: 'Si un compte correspond à cet identifiant, un lien de réinitialisation vient d’être envoyé.' });
});

app.post('/api/auth/reset', (req, res) => {
  const data = db.load();
  const token = str(req.body.token, 120);
  const password = String(req.body.password || '');
  if (password.length < 6) return bad(res, 'Le mot de passe doit contenir au moins 6 caractères');
  const user = data.users.find((u) => u.resetToken === token && u.resetTokenExpires > Date.now());
  if (!user) return bad(res, 'Ce lien de réinitialisation est invalide ou a expiré', 400);
  user.passwordHash = db.hashPassword(password);
  delete user.resetToken;
  delete user.resetTokenExpires;
  db.save();
  res.json({ ok: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
});

/* -------------------------------- Account -------------------------------- */

app.put('/api/account/profile', requireAuth, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return bad(res, 'Compte introuvable', 404);
  const name = str(req.body.name, 80);
  const email = db.normalizeEmail(req.body.email);
  const phone = db.normalizePhone(req.body.phone);
  if (!name) return bad(res, 'Le nom est obligatoire');
  if (!email && !phone) return bad(res, 'Indiquez un e-mail ou un numéro de téléphone');
  if (email && !isEmail(email)) return bad(res, 'Adresse e-mail invalide');
  if (email && data.users.some((u) => u.id !== user.id && u.email === email)) {
    return bad(res, 'Cet e-mail est déjà utilisé');
  }
  if (phone && data.users.some((u) => u.id !== user.id && u.phone === phone)) {
    return bad(res, 'Ce numéro est déjà utilisé');
  }
  user.name = name;
  user.email = email;
  user.phone = phone;
  user.language = ['fr', 'en'].includes(req.body.language) ? req.body.language : user.language;
  db.save();
  res.json({ ok: true, user: db.publicUser(user) });
});

app.put('/api/account/password', requireAuth, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (next.length < 6) return bad(res, 'Le nouveau mot de passe doit contenir au moins 6 caractères');
  if (!db.verifyPassword(current, user.passwordHash)) return bad(res, 'Mot de passe actuel incorrect');
  user.passwordHash = db.hashPassword(next);
  db.save();
  res.json({ ok: true, message: 'Mot de passe modifié' });
});

function addVehicle(req, res) {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  const vehicle = {
    id: db.uid('veh'),
    brand: str(req.body.brand, 60),
    model: str(req.body.model, 60),
    vin: str(req.body.vin, 40).toUpperCase(),
    type: str(req.body.type, 60),
    year: Number(req.body.year) || null,
  };
  if (!vehicle.brand && !vehicle.model && !vehicle.vin) return bad(res, 'Indiquez au moins la marque, le modèle ou le châssis');
  user.vehicles = user.vehicles || [];
  user.vehicles.unshift(vehicle);
  db.save();
  res.status(201).json({ ok: true, vehicle, user: db.publicUser(user) });
}

function addContainerRef(req, res) {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  const container = {
    id: db.uid('ctr'),
    type: str(req.body.type, 80),
    condition: ['neuf', 'occasion'].includes(req.body.condition) ? req.body.condition : '',
    notes: str(req.body.notes, 300),
  };
  if (!container.type) return bad(res, 'Indiquez le type de conteneur');
  user.containers = user.containers || [];
  user.containers.unshift(container);
  db.save();
  res.status(201).json({ ok: true, container, user: db.publicUser(user) });
}

app.post('/api/account/vehicles', requireAuth, addVehicle);
app.post('/api/account/containers', requireAuth, addContainerRef);

app.delete('/api/account/vehicles/:id', requireAuth, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  user.vehicles = (user.vehicles || []).filter((v) => v.id !== req.params.id);
  db.save();
  res.json({ ok: true, user: db.publicUser(user) });
});

app.delete('/api/account/containers/:id', requireAuth, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  user.containers = (user.containers || []).filter((c) => c.id !== req.params.id);
  db.save();
  res.json({ ok: true, user: db.publicUser(user) });
});

app.get('/api/account/quotes', requireAuth, (req, res) => {
  const data = db.load();
  const quotes = data.quotes
    .filter((q) => q.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ quotes });
});

app.get('/api/account/notifications', requireAuth, (req, res) => {
  const data = db.load();
  const notifications = data.notifications
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications, unread: notifications.filter((n) => !n.read).length });
});

app.post('/api/account/notifications/:id/read', requireAuth, (req, res) => {
  const data = db.load();
  const notification = data.notifications.find((n) => n.id === req.params.id && n.userId === req.user.id);
  if (notification) {
    notification.read = true;
    db.save();
  }
  res.json({ ok: true });
});

/* -------------------------------- Content -------------------------------- */

app.get('/api/content', (req, res) => {
  const data = db.load();
  const today = new Date().toISOString().slice(0, 10);
  const departures = data.departures
    .filter((d) => d.departureDate >= today && d.status !== 'departed')
    .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
  res.json({
    sliders: data.sliders.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    departures,
    ports: data.ports,
    containers: data.containers.filter((c) => c.active !== false),
    services: data.services.filter((s) => s.active !== false),
  });
});

app.get('/api/departures', (req, res) => {
  const data = db.load();
  const today = new Date().toISOString().slice(0, 10);
  const departures = data.departures
    .filter((d) => d.departureDate >= today && d.status !== 'departed')
    .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
  res.json({ departures });
});

app.get('/api/ports', (req, res) => res.json({ ports: db.load().ports }));
app.get('/api/containers', (req, res) => {
  res.json({ containers: db.load().containers.filter((c) => c.active !== false) });
});
app.get('/api/sliders', (req, res) => {
  const data = db.load();
  res.json({ sliders: data.sliders.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) });
});
app.get('/api/services', (req, res) => {
  res.json({ services: db.load().services.filter((s) => s.active !== false) });
});

/* --------------------------------- Quotes -------------------------------- */

function saveRefsFromQuote(user, type, payload) {
  if (!user) return;
  user.vehicles = user.vehicles || [];
  user.containers = user.containers || [];
  if (type === 'roro' && payload.vehicle) {
    const v = payload.vehicle;
    if (v.brand || v.model || v.vin) {
      const exists = user.vehicles.some(
        (x) =>
          (v.vin && x.vin && x.vin.toUpperCase() === String(v.vin).toUpperCase()) ||
          (x.brand === v.brand && x.model === v.model && String(x.year) === String(v.year))
      );
      if (!exists) {
        user.vehicles.unshift({
          id: db.uid('veh'),
          brand: str(v.brand, 60),
          model: str(v.model, 60),
          vin: str(v.vin, 40).toUpperCase(),
          type: str(v.type, 60),
          year: Number(v.year) || null,
        });
      }
    }
  }
  if (type === 'container' && payload.containerId) {
    const exists = user.containers.some(
      (x) => x.type === payload.containerName && x.condition === payload.condition
    );
    if (!exists) {
      user.containers.unshift({
        id: db.uid('ctr'),
        type: str(payload.containerName, 80),
        condition: str(payload.condition, 20),
        notes: str(payload.delivery && payload.delivery.city, 120),
      });
    }
  }
}

app.post('/api/quotes', (req, res) => {
  const data = db.load();
  const type = str(req.body.type, 20);
  if (!['roro', 'container', 'service'].includes(type)) return bad(res, 'Type de demande invalide');

  const contact = db.cleanObject(req.body.contact);
  contact.name = str(contact.name, 80);
  contact.email = db.normalizeEmail(contact.email);
  contact.phone = db.normalizePhone(contact.phone);
  contact.city = str(contact.city, 80);
  contact.country = str(contact.country, 80);
  if (!contact.name) return bad(res, 'Le nom est obligatoire');
  if (!contact.email && !contact.phone) return bad(res, 'Indiquez un e-mail ou un numéro de téléphone');
  if (contact.email && !isEmail(contact.email)) return bad(res, 'Adresse e-mail invalide');

  const payload = db.cleanObject(req.body.payload);
  if (type === 'roro') {
    const fromPort = data.ports.find((p) => p.id === payload.fromPortId);
    const toPort = data.ports.find((p) => p.id === payload.toPortId);
    if (!fromPort || !toPort) return bad(res, 'Sélectionnez un port de départ et un port d’arrivée');
    if (payload.departureId) {
      const departure = data.departures.find((d) => d.id === payload.departureId);
      if (!departure) return bad(res, 'Départ introuvable');
      payload.ship = departure.ship;
    }
    if (
      !payload.vehicle ||
      (!str(payload.vehicle.brand, 60) && !str(payload.vehicle.model, 60) && !str(payload.vehicle.vin, 40))
    ) {
      return bad(res, 'Renseignez au moins la marque, le modèle ou le châssis du véhicule');
    }
  }
  if (type === 'container') {
    const container = data.containers.find((c) => c.id === payload.containerId);
    if (!container) return bad(res, 'Sélectionnez un type de conteneur');
    payload.containerName = container.name;
    payload.quantity = Math.max(1, Math.min(100, Number(payload.quantity) || 1));
    if (!['neuf', 'occasion'].includes(payload.condition)) return bad(res, 'Choisissez l’état souhaité');
  }
  if (type === 'service') {
    const service = data.services.find((s) => s.id === payload.serviceId);
    if (!service) return bad(res, 'Sélectionnez un service');
    payload.serviceName = service.name;
  }

  let distance = null;
  if (req.body.distance && typeof req.body.distance === 'object') {
    const km = Number(req.body.distance.km);
    if (Number.isFinite(km) && km >= 0 && km <= 50000) {
      distance = {
        km: Math.round(km * 10) / 10,
        durationMin: Math.max(0, Math.round(Number(req.body.distance.durationMin) || 0)),
        mode: req.body.distance.mode === 'road' ? 'road' : 'straight',
        from: db.cleanObject(req.body.distance.from),
        to: db.cleanObject(req.body.distance.to),
      };
    }
  }

  const number = db.nextNumber(type);
  const quote = {
    id: db.uid('quote'),
    number,
    type,
    contact,
    payload,
    distance,
    userId: req.user ? req.user.id : null,
    status: 'received',
    adminResponse: null,
    createdAt: now(),
    updatedAt: now(),
  };
  data.quotes.unshift(quote);
  saveRefsFromQuote(req.user, type, payload);

  const labels = { roro: 'Ro-Ro', container: 'Conteneur', service: 'Autre service' };
  pushNotification(
    null,
    'new_quote',
    `Nouvelle demande ${number}`,
    `${contact.name} — ${labels[type]}`,
    quote.id
  );
  db.save();
  mailer.sendQuoteConfirmation(quote).catch(() => {});
  mailer.sendNewQuoteAlert(quote).catch(() => {});
  res.status(201).json({ ok: true, number, quote });
});

app.get('/api/quotes/:id', requireAuth, (req, res) => {
  const data = db.load();
  const quote = data.quotes.find((q) => q.id === req.params.id);
  if (!quote) return bad(res, 'Demande introuvable', 404);
  if (req.user.role !== 'admin' && quote.userId !== req.user.id) {
    return bad(res, 'Accès refusé', 403);
  }
  res.json({ quote });
});

app.post('/api/quotes/:id/respond', requireAdmin, (req, res) => {
  const data = db.load();
  const quote = data.quotes.find((q) => q.id === req.params.id);
  if (!quote) return bad(res, 'Demande introuvable', 404);
  const status = VALID_QUOTE_STATUSES.includes(req.body.status) ? req.body.status : 'quoted';
  quote.adminResponse = {
    price: str(req.body.price, 120),
    message: str(req.body.message, 2000),
    respondedAt: now(),
  };
  quote.status = status;
  quote.updatedAt = now();
  if (quote.userId) {
    pushNotification(
      quote.userId,
      'quote_response',
      `Réponse à votre demande ${quote.number}`,
      status === 'quoted' ? 'Votre cotation est disponible.' : `Statut mis à jour : ${QUOTE_STATUS_LABELS[status] || status}`,
      quote.id
    );
  }
  db.save();
  mailer.sendQuoteResponse(quote).catch(() => {});
  res.json({ ok: true, quote });
});

app.patch('/api/quotes/:id/status', requireAdmin, (req, res) => {
  const data = db.load();
  const quote = data.quotes.find((q) => q.id === req.params.id);
  if (!quote) return bad(res, 'Demande introuvable', 404);
  if (!VALID_QUOTE_STATUSES.includes(req.body.status)) return bad(res, 'Statut invalide');
  quote.status = req.body.status;
  quote.updatedAt = now();
  if (quote.userId && req.body.status !== 'received') {
    pushNotification(
      quote.userId,
      'quote_status',
      `Votre demande ${quote.number} est : ${QUOTE_STATUS_LABELS[req.body.status] || req.body.status}`,
      '',
      quote.id
    );
  }
  db.save();
  res.json({ ok: true, quote });
});

/* ------------------------------- Admin data ------------------------------- */

app.get('/api/admin/departures', requireAdmin, (req, res) => {
  const departures = db.load().departures.slice().sort((a, b) => new Date(b.departureDate) - new Date(a.departureDate));
  res.json({ departures });
});

app.get('/api/admin/ports', requireAdmin, (req, res) => res.json({ ports: db.load().ports }));
app.get('/api/admin/containers', requireAdmin, (req, res) => {
  res.json({ containers: db.load().containers });
});
app.get('/api/admin/sliders', requireAdmin, (req, res) => {
  res.json({ sliders: db.load().sliders.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) });
});
app.get('/api/admin/services', requireAdmin, (req, res) => res.json({ services: db.load().services }));

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const data = db.load();
  const today = new Date().toISOString().slice(0, 10);
  const quotes = data.quotes;
  const byStatus = {};
  const byType = {};
  for (const s of VALID_QUOTE_STATUSES) byStatus[s] = 0;
  for (const t of ['roro', 'container', 'service']) byType[t] = 0;
  for (const q of quotes) {
    if (byStatus[q.status] != null) byStatus[q.status] += 1;
    if (byType[q.type] != null) byType[q.type] += 1;
  }
  const todayQuotes = quotes.filter((q) => q.createdAt.slice(0, 10) === today);
  res.json({
    stats: {
      quotes: {
        total: quotes.length,
        today: todayQuotes.length,
        received: quotes.filter((q) => q.status === 'received').length,
        byStatus,
        byType,
      },
      departures: {
        upcoming: data.departures.filter((d) => d.departureDate >= today && d.status !== 'departed').length,
        total: data.departures.length,
      },
      users: {
        total: data.users.length,
        clients: data.users.filter((u) => u.role === 'client').length,
      },
      containers: data.containers.length,
      unreadNotifications: data.notifications.filter((n) => !n.userId && !n.read).length,
    },
    recentQuotes: quotes.slice(0, 6),
    upcomingDepartures: data.departures
      .filter((d) => d.departureDate >= today && d.status !== 'departed')
      .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate))
      .slice(0, 5),
  });
});

app.get('/api/admin/quotes', requireAdmin, (req, res) => {
  const data = db.load();
  let quotes = data.quotes.slice();
  const { type, status, q, from, to } = req.query;
  if (type && ['roro', 'container', 'service'].includes(type)) {
    quotes = quotes.filter((x) => x.type === type);
  }
  if (status && VALID_QUOTE_STATUSES.includes(status)) {
    quotes = quotes.filter((x) => x.status === status);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    quotes = quotes.filter(
      (x) =>
        x.number.toLowerCase().includes(needle) ||
        (x.contact.name || '').toLowerCase().includes(needle) ||
        (x.contact.email || '').toLowerCase().includes(needle) ||
        (x.contact.phone || '').includes(needle)
    );
  }
  if (from) quotes = quotes.filter((x) => x.createdAt.slice(0, 10) >= String(from));
  if (to) quotes = quotes.filter((x) => x.createdAt.slice(0, 10) <= String(to));
  quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ quotes });
});

/* Departures */
app.post('/api/admin/departures', requireAdmin, (req, res) => {
  const data = db.load();
  const ship = str(req.body.ship, 80);
  const fromPortId = str(req.body.fromPortId, 60);
  const toPortId = str(req.body.toPortId, 60);
  const departureDate = str(req.body.departureDate, 10);
  const depositDeadline = str(req.body.depositDeadline, 10);
  const status = VALID_DEPARTURE_STATUSES.includes(req.body.status) ? req.body.status : 'open';
  if (!ship) return bad(res, 'Le nom du navire est obligatoire');
  if (!data.ports.some((p) => p.id === fromPortId) || !data.ports.some((p) => p.id === toPortId)) {
    return bad(res, 'Ports de départ et d’arrivée requis');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return bad(res, 'Date de départ invalide');
  const departure = {
    id: db.uid('dep'),
    ship,
    fromPortId,
    toPortId,
    departureDate,
    depositDeadline,
    status,
    note: str(req.body.note, 300),
    createdAt: now(),
  };
  data.departures.push(departure);
  db.save();
  res.status(201).json({ ok: true, departure });
});

app.put('/api/admin/departures/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const departure = data.departures.find((d) => d.id === req.params.id);
  if (!departure) return bad(res, 'Départ introuvable', 404);
  const ship = str(req.body.ship, 80);
  const fromPortId = str(req.body.fromPortId, 60);
  const toPortId = str(req.body.toPortId, 60);
  if (!ship) return bad(res, 'Le nom du navire est obligatoire');
  if (!data.ports.some((p) => p.id === fromPortId) || !data.ports.some((p) => p.id === toPortId)) {
    return bad(res, 'Ports de départ et d’arrivée requis');
  }
  Object.assign(departure, {
    ship,
    fromPortId,
    toPortId,
    departureDate: str(req.body.departureDate, 10),
    depositDeadline: str(req.body.depositDeadline, 10),
    status: VALID_DEPARTURE_STATUSES.includes(req.body.status) ? req.body.status : departure.status,
    note: str(req.body.note, 300),
  });
  db.save();
  res.json({ ok: true, departure });
});

app.delete('/api/admin/departures/:id', requireAdmin, (req, res) => {
  const data = db.load();
  data.departures = data.departures.filter((d) => d.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

/* Ports */
app.post('/api/admin/ports', requireAdmin, (req, res) => {
  const data = db.load();
  const name = str(req.body.name, 80);
  const city = str(req.body.city, 80);
  const country = str(req.body.country, 60);
  const countryCode = str(req.body.countryCode, 2).toUpperCase();
  const role = VALID_PORT_ROLES.includes(req.body.role) ? req.body.role : 'both';
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!name || !country) return bad(res, 'Nom et pays du port requis');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return bad(res, 'Coordonnées GPS invalides');
  }
  const port = { id: db.uid('port'), name, city, country, countryCode, role, lat, lng, createdAt: now() };
  data.ports.push(port);
  db.save();
  res.status(201).json({ ok: true, port });
});

app.put('/api/admin/ports/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const port = data.ports.find((p) => p.id === req.params.id);
  if (!port) return bad(res, 'Port introuvable', 404);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!str(req.body.name, 80) || !str(req.body.country, 60)) return bad(res, 'Nom et pays requis');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return bad(res, 'Coordonnées GPS invalides');
  }
  Object.assign(port, {
    name: str(req.body.name, 80),
    city: str(req.body.city, 80),
    country: str(req.body.country, 60),
    countryCode: str(req.body.countryCode, 2).toUpperCase(),
    role: VALID_PORT_ROLES.includes(req.body.role) ? req.body.role : port.role,
    lat,
    lng,
  });
  db.save();
  res.json({ ok: true, port });
});

app.delete('/api/admin/ports/:id', requireAdmin, (req, res) => {
  const data = db.load();
  if (data.departures.some((d) => d.fromPortId === req.params.id || d.toPortId === req.params.id)) {
    return bad(res, 'Ce port est utilisé par un départ. Supprimez d’abord le départ concerné.');
  }
  data.ports = data.ports.filter((p) => p.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

/* Containers */
app.post('/api/admin/containers', requireAdmin, (req, res) => {
  const data = db.load();
  const name = str(req.body.name, 80);
  if (!name) return bad(res, 'Le nom du conteneur est requis');
  const container = {
    id: db.uid('ctr'),
    name,
    shortName: str(req.body.shortName, 30),
    description: str(req.body.description, 800),
    dimensions: str(req.body.dimensions, 80),
    volume: str(req.body.volume, 40),
    image: str(req.body.image, 500) || '/img/containers/20ft.jpg',
    active: req.body.active !== false,
    createdAt: now(),
  };
  data.containers.push(container);
  db.save();
  res.status(201).json({ ok: true, container });
});

app.put('/api/admin/containers/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const container = data.containers.find((c) => c.id === req.params.id);
  if (!container) return bad(res, 'Conteneur introuvable', 404);
  Object.assign(container, {
    name: str(req.body.name, 80) || container.name,
    shortName: str(req.body.shortName, 30),
    description: str(req.body.description, 800),
    dimensions: str(req.body.dimensions, 80),
    volume: str(req.body.volume, 40),
    image: str(req.body.image, 500) || container.image,
    active: req.body.active !== false,
  });
  db.save();
  res.json({ ok: true, container });
});

app.delete('/api/admin/containers/:id', requireAdmin, (req, res) => {
  const data = db.load();
  data.containers = data.containers.filter((c) => c.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

/* Sliders */
app.post('/api/admin/sliders', requireAdmin, (req, res) => {
  const data = db.load();
  if (data.sliders.length >= 6) return bad(res, 'Le slider contient déjà 6 images (maximum)');
  const src = str(req.body.src, 500);
  if (!src) return bad(res, 'Image requise');
  const order = Math.max(0, ...data.sliders.map((s) => s.order || 0)) + 1;
  const slider = {
    id: db.uid('slide'),
    src,
    caption: str(req.body.caption, 160),
    sub: str(req.body.sub, 240),
    order,
  };
  data.sliders.push(slider);
  db.save();
  res.status(201).json({ ok: true, slider });
});

app.put('/api/admin/sliders/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const slider = data.sliders.find((s) => s.id === req.params.id);
  if (!slider) return bad(res, 'Image introuvable', 404);
  if (req.body.src != null) slider.src = str(req.body.src, 500) || slider.src;
  if (req.body.caption != null) slider.caption = str(req.body.caption, 160);
  if (req.body.sub != null) slider.sub = str(req.body.sub, 240);
  db.save();
  res.json({ ok: true, slider });
});

app.delete('/api/admin/sliders/:id', requireAdmin, (req, res) => {
  const data = db.load();
  if (data.sliders.length <= 5) return bad(res, 'Le slider doit conserver au moins 5 images');
  data.sliders = data.sliders.filter((s) => s.id !== req.params.id);
  data.sliders.forEach((s, index) => (s.order = index + 1));
  db.save();
  res.json({ ok: true });
});

app.post('/api/admin/sliders/reorder', requireAdmin, (req, res) => {
  const data = db.load();
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length !== data.sliders.length || !ids.every((id) => data.sliders.some((s) => s.id === id))) {
    return bad(res, 'Ordre invalide');
  }
  ids.forEach((id, index) => {
    const slider = data.sliders.find((s) => s.id === id);
    slider.order = index + 1;
  });
  db.save();
  res.json({ ok: true, sliders: data.sliders.slice().sort((a, b) => a.order - b.order) });
});

/* Services */
app.post('/api/admin/services', requireAdmin, (req, res) => {
  const data = db.load();
  const name = str(req.body.name, 80);
  if (!name) return bad(res, 'Le nom du service est requis');
  const service = {
    id: db.uid('svc'),
    name,
    icon: str(req.body.icon, 8) || '🚚',
    description: str(req.body.description, 800),
    active: req.body.active !== false,
    createdAt: now(),
  };
  data.services.push(service);
  db.save();
  res.status(201).json({ ok: true, service });
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const service = data.services.find((s) => s.id === req.params.id);
  if (!service) return bad(res, 'Service introuvable', 404);
  Object.assign(service, {
    name: str(req.body.name, 80) || service.name,
    icon: str(req.body.icon, 8) || service.icon,
    description: str(req.body.description, 800),
    active: req.body.active !== false,
  });
  db.save();
  res.json({ ok: true, service });
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  const data = db.load();
  data.services = data.services.filter((s) => s.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

/* Users */
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const data = db.load();
  const users = data.users.map((u) => ({
    ...db.publicUser(u),
    quoteCount: data.quotes.filter((q) => q.userId === u.id).length,
  }));
  res.json({ users });
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return bad(res, 'Utilisateur introuvable', 404);
  if (user.id === req.user.id && (req.body.active === false || req.body.role !== 'admin')) {
    return bad(res, 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
  }
  if (req.body.role != null) {
    if (!['client', 'admin'].includes(req.body.role)) return bad(res, 'Rôle invalide');
    user.role = req.body.role;
  }
  if (req.body.active != null) user.active = !!req.body.active;
  db.save();
  res.json({ ok: true, user: db.publicUser(user) });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return bad(res, 'Utilisateur introuvable', 404);
  if (user.id === req.user.id) return bad(res, 'Vous ne pouvez pas supprimer votre propre compte');
  if (user.role === 'admin') return bad(res, 'La suppression d’un compte administrateur est désactivée');
  data.users = data.users.filter((u) => u.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

/* Notifications */
app.get('/api/admin/notifications', requireAdmin, (req, res) => {
  const data = db.load();
  const notifications = data.notifications
    .filter((n) => !n.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications, unread: notifications.filter((n) => !n.read).length });
});

app.post('/api/admin/notifications/:id/read', requireAdmin, (req, res) => {
  const data = db.load();
  const notification = data.notifications.find((n) => n.id === req.params.id && !n.userId);
  if (notification) {
    notification.read = true;
    db.save();
  }
  res.json({ ok: true });
});

app.post('/api/admin/notifications/read-all', requireAdmin, (req, res) => {
  const data = db.load();
  for (const notification of data.notifications) {
    if (!notification.userId) notification.read = true;
  }
  db.save();
  res.json({ ok: true });
});

/* Uploads (admin) */
app.post('/api/admin/upload', requireAdmin, (req, res) => {
  const dataUrl = String(req.body.dataUrl || '');
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return bad(res, 'Image invalide (JPEG, PNG ou WebP)');
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 6 * 1024 * 1024) return bad(res, 'Image trop lourde (6 Mo maximum)');
  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  res.status(201).json({ ok: true, url: `/uploads/${filename}` });
});

/* --------------------------------- 404 ---------------------------------- */

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'Route API introuvable' });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !path.extname(req.path)) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  next();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, message: 'Erreur interne du serveur' });
});

seedIfEmpty();
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚢 Application de transit disponible sur http://0.0.0.0:${PORT}`);
});
