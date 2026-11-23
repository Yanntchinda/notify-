'use strict';

/*
 * API Supabase — remplace le serveur Node sans changer l'interface.
 * L'application continue d'appeler T.api.get('/api/...') : ce module traduit
 * chaque appel en requêtes Supabase (PostgreSQL + Auth + Storage).
 *
 * Configuration : window.APP_CONFIG = { supabaseUrl, supabaseAnonKey, appUrl }
 * (fichier public/js/config.js, rempli par scripts/build-mobile.js)
 */

window.T = window.T || {};

(function () {
  const CFG = (window.APP_CONFIG || {});
  let client = null;

  function configured() {
    return Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  }

  function sb() {
    if (!client) {
      if (!configured()) throw fail('Base de données non configurée', 500);
      client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return client;
  }

  function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function unwrap(result, message = 'Opération impossible') {
    if (result.error) throw fail(result.error.message || message, result.error.code === '42501' ? 403 : 400);
    return result.data;
  }

  async function requireSession() {
    const { data } = await sb().auth.getSession();
    if (!data.session) throw fail('Authentification requise', 401);
    return data.session;
  }

  async function requireAdmin() {
    const session = await requireSession();
    const profile = await profileRow(session.user.id);
    if (!profile || profile.role !== 'admin' || !profile.active) throw fail('Accès administrateur requis', 403);
    return { session, profile };
  }

  /* ------------------------------ Mapping SQL ↔ JS ---------------------- */

  const toPort = (r) => ({
    id: r.id, name: r.name, city: r.city, country: r.country,
    countryCode: r.country_code, role: r.role, lat: Number(r.lat), lng: Number(r.lng),
  });
  const portRow = (p) => ({
    id: p.id, name: p.name, city: p.city, country: p.country,
    country_code: p.countryCode, role: p.role, lat: p.lat, lng: p.lng,
  });

  const toDeparture = (r) => ({
    id: r.id, ship: r.ship, fromPortId: r.from_port_id, toPortId: r.to_port_id,
    departureDate: r.departure_date, depositDeadline: r.deposit_deadline,
    status: r.status, note: r.note, createdAt: r.created_at,
  });
  const departureRow = (d) => ({
    id: d.id, ship: d.ship, from_port_id: d.fromPortId, to_port_id: d.toPortId,
    departure_date: d.departureDate, deposit_deadline: d.depositDeadline,
    status: d.status, note: d.note,
  });

  const toContainer = (r) => ({
    id: r.id, name: r.name, shortName: r.short_name, description: r.description,
    dimensions: r.dimensions, volume: r.volume, image: r.image, active: r.active,
  });
  const containerRow = (c) => ({
    id: c.id, name: c.name, short_name: c.shortName, description: c.description,
    dimensions: c.dimensions, volume: c.volume, image: c.image, active: c.active !== false,
  });

  const toSlider = (r) => ({
    id: r.id, src: r.src, caption: r.caption, sub: r.sub, order: r.order, active: r.active,
  });
  const sliderRow = (s) => ({ id: s.id, src: s.src, caption: s.caption, sub: s.sub, order: s.order });

  const toService = (r) => ({
    id: r.id, name: r.name, icon: r.icon, description: r.description, order: r.order, active: r.active,
  });
  const serviceRow = (s) => ({ id: s.id, name: s.name, icon: s.icon, description: s.description, order: s.order });

  const toQuote = (r) => ({
    id: r.id, number: r.number, type: r.type, status: r.status,
    contact: r.contact || {}, payload: r.payload || {}, distance: r.distance || null,
    userId: r.user_id || null,
    adminResponse: r.admin_response || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });

  const toNotification = (r) => ({
    id: r.id, userId: r.user_id || null, kind: r.kind, title: r.title,
    message: r.message, quoteId: r.quote_id || null, read: Boolean(r.read),
    createdAt: r.created_at,
  });

  const toVehicle = (r) => ({
    id: r.id, brand: r.brand, model: r.model, vin: r.vin, type: r.type,
    year: r.year, createdAt: r.created_at,
  });

  const toContainerRef = (r) => ({
    id: r.id, type: r.type, condition: r.condition, notes: r.notes, createdAt: r.created_at,
  });

  async function profileRow(id) {
    const result = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
    return unwrap(result, 'Profil introuvable');
  }

  async function publicUser(id) {
    const profile = await profileRow(id);
    if (!profile) return null;
    const [vehicles, containers] = await Promise.all([
      sb().from('vehicles').select('*').eq('user_id', id),
      sb().from('container_refs').select('*').eq('user_id', id),
    ]);
    return {
      id: profile.id,
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      role: profile.role,
      active: profile.active !== false,
      language: profile.language || 'fr',
      vehicles: (vehicles.data || []).map(toVehicle),
      containers: (containers.data || []).map(toContainerRef),
      createdAt: profile.created_at,
    };
  }

  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');

  function emailFor(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return '';
    if (value.includes('@')) return value.toLowerCase();
    const phone = value.replace(/[^\d+]/g, '');
    if (!phone) return '';
    return `${phone}@phone.transit.app`;
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const today = () => new Date().toISOString().slice(0, 10);

  /* ------------------------------- Contenu ----------------------------- */

  async function content() {
    const [sliders, departures, ports, containers, services] = await Promise.all([
      sb().from('sliders').select('*').order('order', { ascending: true }),
      sb().from('departures').select('*'),
      sb().from('ports').select('*'),
      sb().from('containers').select('*'),
      sb().from('services').select('*'),
    ]);
    const date = today();
    const upcoming = unwrap(departures)
      .map(toDeparture)
      .filter((d) => d.departureDate >= date && d.status !== 'departed')
      .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
    return {
      sliders: unwrap(sliders).map(toSlider),
      departures: upcoming,
      ports: unwrap(ports).map(toPort),
      containers: unwrap(containers).filter((c) => c.active !== false).map(toContainer),
      services: unwrap(services).filter((s) => s.active !== false).map(toService),
    };
  }

  /* -------------------------------- Auth ------------------------------- */

  async function register(body) {
    const identifier = String(body.identifier || '').trim();
    const email = emailFor(identifier);
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 80);
    const phone = String(body.phone || (identifier.includes('@') ? '' : identifier)).replace(/[^\d+]/g, '');
    if (!email) throw fail('Indiquez un e-mail ou un numéro de téléphone');
    if (password.length < 6) throw fail('Mot de passe trop court (6 caractères minimum)');
    if (!name) throw fail('Le nom est obligatoire');

    const { data, error } = await sb().auth.signUp({
      email,
      password,
      options: { data: { name, phone } },
    });
    if (error) throw fail(error.message.includes('already registered') ? 'Un compte existe déjà avec cet identifiant' : error.message);

    const user = data.user;
    if (!user) throw fail('Inscription impossible');

    /* Sans session (confirmation par e-mail activée), cette mise à jour est
       refusée par RLS : le trigger de création a déjà inscrit nom et téléphone. */
    try {
      await sb().from('profiles').update({ name, phone }).eq('id', user.id);
    } catch (err) {
      /* ignoré */
    }

    /* Si la confirmation par e-mail est désactivée, une session est déjà ouverte.
       Sinon on tente une connexion directe (comptes de démonstration). */
    if (!data.session) {
      const signed = await sb().auth.signInWithPassword({ email, password });
      if (signed.error) throw fail('Compte créé. Confirmez votre adresse e-mail pour vous connecter.');
    }
    return { ok: true, user: await publicUser(user.id) };
  }

  async function login(body) {
    const email = emailFor(body.identifier);
    const password = String(body.password || '');
    if (!email || !password) throw fail('Identifiants requis');
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw fail('Identifiants incorrects', 401);
    const user = await publicUser(data.user.id);
    if (!user) {
      await sb().auth.signOut();
      throw fail('Compte introuvable', 404);
    }
    if (!user.active) {
      await sb().auth.signOut();
      throw fail('Ce compte est désactivé', 403);
    }
    return { ok: true, user };
  }

  /* ------------------------------- Demandes ---------------------------- */

  async function createQuote(body) {
    const type = String(body.type || '');
    if (!['roro', 'container', 'service'].includes(type)) throw fail('Type de demande invalide');

    const contact = body.contact || {};
    const cleanContact = {
      name: String(contact.name || '').trim().slice(0, 80),
      email: String(contact.email || '').trim().toLowerCase().slice(0, 120),
      phone: String(contact.phone || '').replace(/[^\d+]/g, '').slice(0, 30),
      city: String(contact.city || '').trim().slice(0, 80),
      country: String(contact.country || '').trim().slice(0, 80),
    };
    if (!cleanContact.name) throw fail('Le nom est obligatoire');
    if (!cleanContact.email && !cleanContact.phone) throw fail('Indiquez un e-mail ou un numéro de téléphone');
    if (cleanContact.email && !isEmail(cleanContact.email)) throw fail('Adresse e-mail invalide');

    const payload = body.payload || {};
    if (type === 'roro') {
      const vehicle = payload.vehicle || {};
      if (!vehicle.brand && !vehicle.model && !vehicle.vin) {
        throw fail('Renseignez au moins la marque, le modèle ou le châssis du véhicule');
      }
    }
    if (type === 'container') {
      if (!payload.containerId) throw fail('Sélectionnez un type de conteneur');
      if (!['neuf', 'occasion'].includes(payload.condition)) throw fail('Choisissez l’état souhaité');
      payload.quantity = Math.max(1, Math.min(100, Number(payload.quantity) || 1));
    }
    if (type === 'service' && !payload.serviceId) throw fail('Sélectionnez un service');

    let distance = null;
    if (body.distance && typeof body.distance === 'object') {
      const km = Number(body.distance.km);
      if (Number.isFinite(km) && km >= 0 && km <= 50000) {
        distance = {
          km: Math.round(km * 10) / 10,
          durationMin: Math.max(0, Math.round(Number(body.distance.durationMin) || 0)),
          mode: body.distance.mode === 'road' ? 'road' : 'straight',
          from: body.distance.from || null,
          to: body.distance.to || null,
        };
      }
    }

    /* Fonction SECURITY DEFINER : valide les données et retourne la demande
       créée. Aucun accès en lecture aux demandes des autres visiteurs. */
    const inserted = unwrap(
      await sb().rpc('submit_quote', {
        p_type: type,
        p_contact: cleanContact,
        p_payload: payload,
        p_distance: distance,
      }),
      'Enregistrement de la demande impossible'
    );
    const quote = toQuote(Array.isArray(inserted) ? inserted[0] : inserted);
    return { ok: true, number: quote.number, quote };
  }

  /* ------------------------------ Routeur ------------------------------ */

  async function request(method, url, body) {
    const parsed = new URL(url, 'http://local');
    const path = parsed.pathname;
    const query = parsed.searchParams;

    const route = (pattern) => {
      const match = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`).exec(path);
      return match ? match.groups || {} : null;
    };

    /* ------------------------------- Auth ------------------------------ */
    if (method === 'GET' && path === '/api/auth/me') {
      const session = await requireSession();
      return { user: await publicUser(session.user.id) };
    }
    if (method === 'POST' && path === '/api/auth/register') return register(body || {});
    if (method === 'POST' && path === '/api/auth/login') return login(body || {});
    if (method === 'POST' && path === '/api/auth/logout') {
      await sb().auth.signOut();
      return { ok: true };
    }
    if (method === 'POST' && path === '/api/auth/forgot') {
      const email = emailFor((body || {}).identifier);
      if (!email) throw fail('Indiquez votre e-mail ou numéro de téléphone');
      const { error } = await sb().auth.resetPasswordForEmail(email, {
        redirectTo: `${(CFG.appUrl || '').replace(/\/$/, '')}/#/reset`,
      });
      if (error) throw fail('Réinitialisation impossible');
      return { ok: true, message: 'Si un compte correspond à cet identifiant, un lien de réinitialisation vient d’être envoyé.' };
    }
    if (method === 'POST' && path === '/api/auth/reset') {
      const password = String((body || {}).password || '');
      if (password.length < 6) throw fail('Mot de passe trop court (6 caractères minimum)');
      await requireSession();
      const { error } = await sb().auth.updateUser({ password });
      if (error) throw fail('Mot de passe modifié impossible');
      return { ok: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' };
    }

    /* ------------------------------ Contenu ---------------------------- */
    if (method === 'GET' && path === '/api/content') return content();
    if (method === 'GET' && path === '/api/departures') {
      const rows = unwrap(await sb().from('departures').select('*')).map(toDeparture);
      const date = today();
      return { departures: rows.filter((d) => d.departureDate >= date && d.status !== 'departed').sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate)) };
    }
    if (method === 'GET' && path === '/api/ports') return { ports: unwrap(await sb().from('ports').select('*')).map(toPort) };
    if (method === 'GET' && path === '/api/containers') {
      return { containers: unwrap(await sb().from('containers').select('*')).map(toContainer).filter((c) => c.active !== false) };
    }
    if (method === 'GET' && path === '/api/sliders') {
      return { sliders: unwrap(await sb().from('sliders').select('*').order('order')).map(toSlider) };
    }
    if (method === 'GET' && path === '/api/services') {
      return { services: unwrap(await sb().from('services').select('*')).map(toService).filter((s) => s.active !== false) };
    }

    /* --------------------------- Espace client ------------------------- */
    if (method === 'PUT' && path === '/api/account/profile') {
      const session = await requireSession();
      const allowed = {};
      for (const key of ['name', 'phone', 'language']) {
        if (body && body[key] != null) allowed[key] = String(body[key]).slice(0, 80);
      }
      unwrap(await sb().from('profiles').update(allowed).eq('id', session.user.id));
      return { ok: true, user: await publicUser(session.user.id) };
    }
    if (method === 'PUT' && path === '/api/account/password') {
      const password = String((body || {}).password || '');
      if (password.length < 6) throw fail('Mot de passe trop court (6 caractères minimum)');
      await requireSession();
      unwrap(await sb().auth.updateUser({ password }));
      return { ok: true, message: 'Mot de passe modifié' };
    }
    if (method === 'POST' && path === '/api/account/vehicles') {
      const session = await requireSession();
      unwrap(await sb().from('vehicles').insert({
        user_id: session.user.id,
        brand: String((body || {}).brand || '').slice(0, 60),
        model: String((body || {}).model || '').slice(0, 60),
        vin: String((body || {}).vin || '').slice(0, 40),
        type: String((body || {}).type || '').slice(0, 40),
        year: String((body || {}).year || '').slice(0, 10),
      }));
      return { ok: true, user: await publicUser(session.user.id) };
    }
    if (method === 'DELETE' && route('/api/account/vehicles/:id')) {
      const session = await requireSession();
      const params = route('/api/account/vehicles/:id');
      unwrap(await sb().from('vehicles').delete().eq('id', params.id).eq('user_id', session.user.id));
      return { ok: true, user: await publicUser(session.user.id) };
    }
    if (method === 'POST' && path === '/api/account/containers') {
      const session = await requireSession();
      unwrap(await sb().from('container_refs').insert({
        user_id: session.user.id,
        type: String((body || {}).type || '').slice(0, 60),
        condition: String((body || {}).condition || '').slice(0, 30),
        notes: String((body || {}).notes || '').slice(0, 300),
      }));
      return { ok: true, user: await publicUser(session.user.id) };
    }
    if (method === 'DELETE' && route('/api/account/containers/:id')) {
      const session = await requireSession();
      const params = route('/api/account/containers/:id');
      unwrap(await sb().from('container_refs').delete().eq('id', params.id).eq('user_id', session.user.id));
      return { ok: true, user: await publicUser(session.user.id) };
    }
    if (method === 'GET' && path === '/api/account/quotes') {
      const session = await requireSession();
      const rows = unwrap(
        await sb().from('quotes').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      );
      return { quotes: rows.map(toQuote) };
    }
    if (method === 'GET' && path === '/api/account/notifications') {
      const session = await requireSession();
      const rows = unwrap(
        await sb().from('notifications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      );
      const notifications = rows.map(toNotification);
      return { notifications, unread: notifications.filter((n) => !n.read).length };
    }
    if (method === 'POST' && route('/api/account/notifications/:id/read')) {
      const session = await requireSession();
      const params = route('/api/account/notifications/:id/read');
      unwrap(await sb().from('notifications').update({ read: true }).eq('id', params.id).eq('user_id', session.user.id));
      return { ok: true };
    }

    /* ------------------------------ Demandes --------------------------- */
    if (method === 'POST' && path === '/api/quotes') return createQuote(body || {});
    if (method === 'GET' && route('/api/quotes/:id')) {
      const params = route('/api/quotes/:id');
      const row = unwrap(await sb().from('quotes').select('*').eq('id', params.id).maybeSingle(), 'Demande introuvable');
      if (!row) throw fail('Demande introuvable', 404);
      return { quote: toQuote(row) };
    }
    if (method === 'POST' && route('/api/quotes/:id/respond')) {
      await requireAdmin();
      const params = route('/api/quotes/:id/respond');
      const status = ['received', 'processing', 'quoted', 'accepted', 'refused'].includes((body || {}).status)
        ? (body || {}).status
        : 'quoted';
      const row = unwrap(
        await sb().from('quotes')
          .update({
            admin_response: {
              price: String((body || {}).price || '').slice(0, 120),
              message: String((body || {}).message || '').slice(0, 2000),
              respondedAt: new Date().toISOString(),
            },
            status,
          })
          .eq('id', params.id)
          .select('*')
          .single(),
        'Réponse impossible'
      );
      await notifyClient(row, status === 'quoted' ? 'Votre cotation est disponible.' : 'Statut mis à jour', 'quote_response');
      return { ok: true, quote: toQuote(row) };
    }
    if (method === 'PATCH' && route('/api/quotes/:id/status')) {
      await requireAdmin();
      const params = route('/api/quotes/:id/status');
      const status = String((body || {}).status || '');
      if (!['received', 'processing', 'quoted', 'accepted', 'refused'].includes(status)) throw fail('Statut invalide');
      const row = unwrap(
        await sb().from('quotes').update({ status }).eq('id', params.id).select('*').single(),
        'Mise à jour impossible'
      );
      if (status !== 'received') {
        await notifyClient(row, '', 'quote_status');
      }
      return { ok: true, quote: toQuote(row) };
    }

    /* --------------------------- Administration ------------------------ */
    if (path.startsWith('/api/admin/')) {
      await requireAdmin();
      return adminRequest(method, path, query, body || {}, route);
    }

    throw fail('Route API introuvable', 404);
  }

  const STATUS_LABELS = {
    received: 'reçue',
    processing: 'en cours',
    quoted: 'cotée',
    accepted: 'acceptée',
    refused: 'refusée',
  };

  async function notifyClient(quoteRow, message, kind) {
    if (!quoteRow || !quoteRow.user_id) return;
    const title = kind === 'quote_status'
      ? `Votre demande ${quoteRow.number} est : ${STATUS_LABELS[quoteRow.status] || quoteRow.status}`
      : `Réponse à votre demande ${quoteRow.number}`;
    try {
      await sb().from('notifications').insert({
        user_id: quoteRow.user_id,
        kind,
        title,
        message,
        quote_id: quoteRow.id,
      });
    } catch (err) {
      /* la réponse est enregistrée même si la notification échoue */
    }
  }

  /* --------------------------- Routes admin ---------------------------- */

  async function adminRequest(method, path, query, body, route) {
    if (method === 'GET' && path === '/api/admin/departures') {
      return { departures: unwrap(await sb().from('departures').select('*')).map(toDeparture) };
    }
    if (method === 'GET' && path === '/api/admin/ports') {
      return { ports: unwrap(await sb().from('ports').select('*')).map(toPort) };
    }
    if (method === 'GET' && path === '/api/admin/containers') {
      return { containers: unwrap(await sb().from('containers').select('*')).map(toContainer) };
    }
    if (method === 'GET' && path === '/api/admin/sliders') {
      return { sliders: unwrap(await sb().from('sliders').select('*').order('order')).map(toSlider) };
    }
    if (method === 'GET' && path === '/api/admin/services') {
      return { services: unwrap(await sb().from('services').select('*')).map(toService) };
    }
    if (method === 'GET' && path === '/api/admin/notifications') {
      const rows = unwrap(await sb().from('notifications').select('*').is('user_id', null).order('created_at', { ascending: false }));
      const notifications = rows.map(toNotification);
      return { notifications, unread: notifications.filter((n) => !n.read).length };
    }
    if (method === 'POST' && route('/api/admin/notifications/:id/read')) {
      const params = route('/api/admin/notifications/:id/read');
      unwrap(await sb().from('notifications').update({ read: true }).eq('id', params.id));
      return { ok: true };
    }
    if (method === 'POST' && path === '/api/admin/notifications/read-all') {
      unwrap(await sb().from('notifications').update({ read: true }).is('user_id', null));
      return { ok: true };
    }

    if (method === 'GET' && path === '/api/admin/quotes') {
      let q = sb().from('quotes').select('*');
      const type = query.get('type');
      const status = query.get('status');
      if (type && ['roro', 'container', 'service'].includes(type)) q = q.eq('type', type);
      if (status) q = q.eq('status', status);
      if (query.get('from')) q = q.gte('created_at', `${query.get('from')}T00:00:00`);
      if (query.get('to')) q = q.lte('created_at', `${query.get('to')}T23:59:59`);
      let rows = unwrap(await q.order('created_at', { ascending: false })).map(toQuote);
      const needle = String(query.get('q') || '').toLowerCase();
      if (needle) {
        rows = rows.filter((quote) =>
          quote.number.toLowerCase().includes(needle) ||
          (quote.contact.name || '').toLowerCase().includes(needle) ||
          (quote.contact.email || '').toLowerCase().includes(needle) ||
          (quote.contact.phone || '').includes(needle)
        );
      }
      return { quotes: rows };
    }

    if (method === 'GET' && path === '/api/admin/stats') {
      const [quotes, profiles, departures, notifications] = await Promise.all([
        sb().from('quotes').select('status, type, created_at'),
        sb().from('profiles').select('id, role'),
        sb().from('departures').select('*'),
        sb().from('notifications').select('read').is('user_id', null),
      ]);
      const quoteRows = unwrap(quotes);
      const byStatus = { received: 0, processing: 0, quoted: 0, accepted: 0, refused: 0 };
      const byType = { roro: 0, container: 0, service: 0 };
      for (const quote of quoteRows) {
        if (byStatus[quote.status] != null) byStatus[quote.status] += 1;
        if (byType[quote.type] != null) byType[quote.type] += 1;
      }
      const date = today();
      const depRows = unwrap(departures).map(toDeparture);
      return {
        stats: {
          quotes: {
            total: quoteRows.length,
            today: quoteRows.filter((quote) => String(quote.created_at).slice(0, 10) === date).length,
            received: quoteRows.filter((quote) => quote.status === 'received').length,
            byStatus,
            byType,
          },
          departures: {
            upcoming: depRows.filter((d) => d.departureDate >= date && d.status !== 'departed').length,
            total: depRows.length,
          },
          users: {
            total: unwrap(profiles).length,
            clients: unwrap(profiles).filter((profile) => profile.role === 'client').length,
          },
          containers: unwrap(await sb().from('containers').select('id')).length,
          unreadNotifications: unwrap(notifications).filter((n) => !n.read).length,
        },
        recentQuotes: unwrap(await sb().from('quotes').select('*').order('created_at', { ascending: false }).limit(6)).map(toQuote),
        upcomingDepartures: depRows
          .filter((d) => d.departureDate >= date && d.status !== 'departed')
          .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate))
          .slice(0, 5),
      };
    }

    if (method === 'GET' && path === '/api/admin/users') {
      const rows = unwrap(await sb().from('profiles').select('*'));
      const counts = unwrap(await sb().from('quotes').select('user_id'));
      const users = [];
      for (const row of rows) {
        const user = await publicUser(row.id);
        users.push({ ...user, quoteCount: counts.filter((quote) => quote.user_id === row.id).length });
      }
      return { users };
    }

    /* --- Départs --- */
    if (method === 'POST' && path === '/api/admin/departures') {
      const row = unwrap(
        await sb().from('departures')
          .insert({ ...departureRow(body), id: uid('dep') })
          .select('*')
          .single(),
        'Création impossible'
      );
      return { ok: true, departure: toDeparture(row) };
    }
    if (method === 'PUT' && route('/api/admin/departures/:id')) {
      const params = route('/api/admin/departures/:id');
      const row = unwrap(await sb().from('departures').update(departureRow(body)).eq('id', params.id).select('*').single(), 'Mise à jour impossible');
      return { ok: true, departure: toDeparture(row) };
    }
    if (method === 'DELETE' && route('/api/admin/departures/:id')) {
      const params = route('/api/admin/departures/:id');
      unwrap(await sb().from('departures').delete().eq('id', params.id));
      return { ok: true };
    }

    /* --- Ports --- */
    if (method === 'POST' && path === '/api/admin/ports') {
      const row = unwrap(await sb().from('ports').insert({ ...portRow(body), id: uid('port') }).select('*').single(), 'Création impossible');
      return { ok: true, port: toPort(row) };
    }
    if (method === 'PUT' && route('/api/admin/ports/:id')) {
      const params = route('/api/admin/ports/:id');
      const row = unwrap(await sb().from('ports').update(portRow(body)).eq('id', params.id).select('*').single(), 'Mise à jour impossible');
      return { ok: true, port: toPort(row) };
    }
    if (method === 'DELETE' && route('/api/admin/ports/:id')) {
      const params = route('/api/admin/ports/:id');
      unwrap(await sb().from('ports').delete().eq('id', params.id));
      return { ok: true };
    }

    /* --- Conteneurs --- */
    if (method === 'POST' && path === '/api/admin/containers') {
      const row = unwrap(await sb().from('containers').insert({ ...containerRow(body), id: uid('ct') }).select('*').single(), 'Création impossible');
      return { ok: true, container: toContainer(row) };
    }
    if (method === 'PUT' && route('/api/admin/containers/:id')) {
      const params = route('/api/admin/containers/:id');
      const row = unwrap(await sb().from('containers').update(containerRow(body)).eq('id', params.id).select('*').single(), 'Mise à jour impossible');
      return { ok: true, container: toContainer(row) };
    }
    if (method === 'DELETE' && route('/api/admin/containers/:id')) {
      const params = route('/api/admin/containers/:id');
      unwrap(await sb().from('containers').delete().eq('id', params.id));
      return { ok: true };
    }

    /* --- Sliders --- */
    if (method === 'POST' && path === '/api/admin/sliders') {
      const sliders = unwrap(await sb().from('sliders').select('order'));
      if (sliders.length >= 6) throw fail('Le slider contient déjà 6 images (maximum)');
      if (!body.src) throw fail('Image requise');
      const order = Math.max(0, ...sliders.map((slider) => slider.order || 0)) + 1;
      const row = unwrap(await sb().from('sliders').insert({ ...sliderRow(body), id: uid('slide'), order }).select('*').single(), 'Création impossible');
      return { ok: true, slider: toSlider(row) };
    }
    if (method === 'PUT' && route('/api/admin/sliders/:id')) {
      const params = route('/api/admin/sliders/:id');
      const patch = {};
      for (const key of ['src', 'caption', 'sub']) if (body[key] != null) patch[key] = String(body[key]).slice(0, 500);
      const row = unwrap(await sb().from('sliders').update(patch).eq('id', params.id).select('*').single(), 'Mise à jour impossible');
      return { ok: true, slider: toSlider(row) };
    }
    if (method === 'DELETE' && route('/api/admin/sliders/:id')) {
      const params = route('/api/admin/sliders/:id');
      const sliders = unwrap(await sb().from('sliders').select('id'));
      if (sliders.length <= 5) throw fail('Le slider doit conserver au moins 5 images');
      unwrap(await sb().from('sliders').delete().eq('id', params.id));
      return { ok: true };
    }
    if (method === 'POST' && path === '/api/admin/sliders/reorder') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      for (let index = 0; index < ids.length; index += 1) {
        await sb().from('sliders').update({ order: index + 1 }).eq('id', ids[index]);
      }
      return { ok: true, sliders: unwrap(await sb().from('sliders').select('*').order('order')).map(toSlider) };
    }

    /* --- Services --- */
    if (method === 'POST' && path === '/api/admin/services') {
      const row = unwrap(await sb().from('services').insert({ ...serviceRow(body), id: uid('svc') }).select('*').single(), 'Création impossible');
      return { ok: true, service: toService(row) };
    }
    if (method === 'PUT' && route('/api/admin/services/:id')) {
      const params = route('/api/admin/services/:id');
      const row = unwrap(await sb().from('services').update(serviceRow(body)).eq('id', params.id).select('*').single(), 'Mise à jour impossible');
      return { ok: true, service: toService(row) };
    }
    if (method === 'DELETE' && route('/api/admin/services/:id')) {
      const params = route('/api/admin/services/:id');
      unwrap(await sb().from('services').delete().eq('id', params.id));
      return { ok: true };
    }

    /* --- Utilisateurs --- */
    if (method === 'PUT' && route('/api/admin/users/:id')) {
      const params = route('/api/admin/users/:id');
      const session = await requireSession();
      if (params.id === session.user.id && (body.active === false || (body.role && body.role !== 'admin'))) {
        throw fail('Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
      }
      const patch = {};
      if (body.role != null) {
        if (!['client', 'admin'].includes(body.role)) throw fail('Rôle invalide');
        patch.role = body.role;
      }
      if (body.active != null) patch.active = Boolean(body.active);
      unwrap(await sb().from('profiles').update(patch).eq('id', params.id));
      return { ok: true, user: await publicUser(params.id) };
    }
    if (method === 'DELETE' && route('/api/admin/users/:id')) {
      const params = route('/api/admin/users/:id');
      const session = await requireSession();
      if (params.id === session.user.id) throw fail('Vous ne pouvez pas supprimer votre propre compte');
      const profile = await profileRow(params.id);
      if (profile && profile.role === 'admin') throw fail('La suppression d’un compte administrateur est désactivée');
      unwrap(await sb().from('profiles').update({ active: false }).eq('id', params.id));
      return { ok: true };
    }

    /* --- Upload --- */
    if (method === 'POST' && path === '/api/admin/upload') {
      const dataUrl = String(body.dataUrl || '');
      const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) throw fail('Image invalide (JPEG, PNG ou WebP)');
      const bytes = Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0));
      if (bytes.length > 6 * 1024 * 1024) throw fail('Image trop lourde (6 Mo maximum)');
      const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      unwrap(await sb().storage.from('uploads').upload(filename, bytes, { contentType: match[1] }), 'Upload impossible');
      const { data } = sb().storage.from('uploads').getPublicUrl(filename);
      return { ok: true, url: data.publicUrl };
    }

    throw fail('Route API introuvable', 404);
  }

  T.apiSupabase = { request, configured };
})();
