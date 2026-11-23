'use strict';

(function () {
  const {
    esc,
    icon,
    statusPill,
    departurePill,
    typeBadge,
    QUOTE_STATUS,
    DEPARTURE_STATUS,
    QUOTE_TYPE,
    fmtDate,
    fmtDateTime,
    initials,
    flag,
    fmtNumber,
    toast,
    modal,
    closeModal,
    confirmDialog,
    setLoading,
    loading,
    emptyState,
    option,
    debounce,
  } = T.ui;

  const state = {
    user: null,
    content: null,
    visitor: (() => {
      try {
        return sessionStorage.getItem('transit_visitor') === '1';
      } catch (err) {
        return false;
      }
    })(),
    lastQuote: null,
    prefillVehicle: null,
    prefillContainer: null,
    roro: null,
    container: null,
    adminSection: 'dashboard',
    adminFilters: { type: '', status: '', q: '', from: '', to: '' },
    adminUnread: 0,
    sliderTimer: null,
    sliderIndex: 0,
    accountTab: 'history',
    loginIntent: null,
  };

  /* ------------------------------- Helpers ------------------------------- */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function port(id) {
    return state.content ? state.content.ports.find((p) => p.id === id) : null;
  }

  function countriesForRole(role) {
    if (!state.content) return [];
    const set = new Set();
    for (const p of state.content.ports) {
      if (role === 'loading' && p.role === 'discharge') continue;
      if (role === 'discharge' && p.role === 'loading') continue;
      if (p.country) set.add(p.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function allCountries() {
    if (!state.content) return [];
    const set = new Set(state.content.ports.map((p) => p.country).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function countryOptions(countries, selected) {
    return countries.map((c) => option(c, c, selected)).join('');
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (err) {
      /* stockage indisponible */
    }
  }

  function storageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (err) {
      /* stockage indisponible */
    }
  }

  function loadContact() {
    try {
      return JSON.parse(localStorage.getItem('transit_contact') || 'null') || {};
    } catch (err) {
      return {};
    }
  }

  function saveContact(contact) {
    try {
      localStorage.setItem(
        'transit_contact',
        JSON.stringify({ name: contact.name || '', email: contact.email || '', phone: contact.phone || '' })
      );
    } catch (err) {
      /* noop */
    }
  }

  async function refreshUser() {
    try {
      const data = await T.api.get('/api/auth/me');
      state.user = data.user;
    } catch (err) {
      state.user = null;
    }
  }

  async function refreshContent() {
    state.content = await T.api.get('/api/content');
  }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function cleanupPage() {
    if (state.sliderTimer) {
      clearInterval(state.sliderTimer);
      state.sliderTimer = null;
    }
    T.map.destroyAll();
    closeModal();
    state.roroWidget = null;
    state.containerWidget = null;
  }

  /* -------------------------------- Shell -------------------------------- */

  function topbarHtml() {
    const user = state.user;
    return `<header class="topbar">
      <a class="brand" href="#/home" aria-label="Transit — accueil">
        <span class="brand-mark">${icon('ship', 22)}</span>
        <span class="brand-name">TRANSIT<small>Ro-Ro &amp; conteneurs</small></span>
      </a>
      <div class="topbar-actions">
        ${
          user && user.role === 'admin'
            ? `<a href="#/admin" class="topbar-link">${icon('dashboard', 18)}<span>Admin</span></a>`
            : ''
        }
        ${
          user
            ? `<a href="#/account" class="user-chip" title="${esc(user.name)}">
                <span class="avatar">${esc(initials(user.name))}</span>
                <span class="user-chip-name">${esc(user.name.split(' ')[0])}</span>
              </a>`
            : `<a href="#/login" class="btn btn-ghost btn-sm">${icon('user', 18)}<span>Se connecter</span></a>`
        }
      </div>
    </header>`;
  }

  function bottomNavHtml(active) {
    const items = [
      { id: 'home', label: 'Accueil', href: '#/home', icon: 'home' },
      { id: 'roro', label: 'Ro-Ro', href: '#/roro', icon: 'ship' },
      { id: 'containers', label: 'Conteneurs', href: '#/containers', icon: 'container' },
      { id: 'services', label: 'Services', href: '#/services', icon: 'grid' },
    ];
    return `<nav class="bottomnav" aria-label="Navigation principale">
      ${items
        .map(
          (item) => `<a class="nav-item ${active === item.id ? 'active' : ''}" href="${item.href}" ${active === item.id ? 'aria-current="page"' : ''}>
            ${icon(item.icon, 22)}<span>${item.label}</span>
          </a>`
        )
        .join('')}
    </nav>`;
  }

  function shell(content, opts = {}) {
    const { active = 'home', nav = true, topbar = true } = opts;
    const demoBanner = T.api.demoMode
      ? `<div class="demo-banner" role="status">${icon('info', 16)}
           <span>Démonstration — la base n'est pas encore connectée. Configurez Supabase pour enregistrer de vraies demandes.</span>
         </div>`
      : '';
    document.getElementById('app').innerHTML = `
      ${topbar ? topbarHtml() : ''}
      ${demoBanner}
      <main class="view">${content}</main>
      ${nav ? bottomNavHtml(active) : ''}
    `;
    window.scrollTo(0, 0);
  }

  /* -------------------------------- Login -------------------------------- */

  function renderLogin(params = {}) {
    cleanupPage();
    if (params.admin) state.loginIntent = 'admin';
    document.getElementById('app').innerHTML = `
      <div class="login-shell">
        <section class="login-hero">
          <img src="/img/slider/slide1.jpg" alt="" />
          <div class="login-hero-overlay"></div>
          <div class="login-hero-content">
            <div class="brand brand-light">
              <span class="brand-mark">${icon('ship', 24)}</span>
              <span class="brand-name">TRANSIT<small>Ro-Ro &amp; conteneurs</small></span>
            </div>
            <h1>Votre véhicule,<br />du porte-à-porte<br />au port.</h1>
            <p class="login-hero-text">Cotation Ro-Ro et conteneurs, sans création de compte obligatoire.</p>
            <ul class="hero-points">
              <li>${icon('check', 16)} Départs réguliers depuis l’Afrique</li>
              <li>${icon('check', 16)} Distance GPS jusqu’au port</li>
              <li>${icon('check', 16)} Réponse par e-mail ou WhatsApp</li>
            </ul>
          </div>
        </section>
        <section class="login-panel">
          <div class="login-card">
            <div class="login-tabs" role="tablist">
              <button class="login-tab active" data-auth-tab="login" type="button">Connexion</button>
              <button class="login-tab" data-auth-tab="register" type="button">Créer un compte</button>
              <button class="login-tab" data-auth-tab="forgot" type="button">Mot de passe oublié</button>
            </div>
            ${
              params.admin
                ? `<div class="notice notice-warning">${icon('lock', 18)}<span>Cet espace est réservé à l’administrateur. Connectez-vous avec un compte administrateur.</span></div>`
                : ''
            }
            <div id="auth-panel"></div>
            <button class="btn btn-visitor" id="btn-visitor" type="button">
              ${icon('navigation', 20)}<span>Continuer en visiteur</span>
            </button>
            <p class="login-legal">Le compte est facultatif. Il sert uniquement à conserver vos références et à suivre vos demandes.</p>
            <div class="demo-accounts">
              <span>Comptes de démonstration</span>
              <div>
                <button class="link-btn" data-demo="admin" type="button">Admin</button>
                <button class="link-btn" data-demo="client" type="button">Client</button>
              </div>
            </div>
          </div>
        </section>
      </div>`;

    $$('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab));
    });
    switchAuthTab('login');

    $('#btn-visitor').addEventListener('click', () => {
      state.visitor = true;
      storageSet('transit_visitor', '1');
      toast('Vous continuez en visiteur. Aucun compte n’est nécessaire.', 'success');
      navigate('#/home');
    });

    $$('[data-demo]').forEach((btn) => {
      btn.addEventListener('click', () => loginDemo(btn.dataset.demo, btn));
    });
  }

  function switchAuthTab(tab) {
    $$('.login-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.authTab === tab));
    const panel = $('#auth-panel');
    if (!panel) return;
    if (tab === 'register') {
      panel.innerHTML = `
        <form id="form-register" class="form">
          <div class="field"><label for="reg-name">Nom complet</label><input id="reg-name" name="name" type="text" required autocomplete="name" placeholder="Votre nom" /></div>
          <div class="field"><label for="reg-email">E-mail</label><input id="reg-email" name="email" type="email" autocomplete="email" placeholder="vous@exemple.com" /></div>
          <div class="field"><label for="reg-phone">Téléphone / WhatsApp <span class="label-optional">facultatif si e-mail</span></label><input id="reg-phone" name="phone" type="tel" autocomplete="tel" placeholder="+237 6 00 00 00 00" /></div>
          <div class="field"><label for="reg-password">Mot de passe</label><input id="reg-password" name="password" type="password" required autocomplete="new-password" placeholder="6 caractères minimum" /></div>
          <button class="btn btn-primary btn-block" type="submit">Créer mon compte</button>
          <p class="form-hint">Les demandes envoyées en visiteur avec le même e-mail ou téléphone seront rattachées automatiquement.</p>
        </form>`;
      $('#form-register').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('[type="submit"]');
        setLoading(button, true, 'Création…');
        try {
          const data = await T.api.post('/api/auth/register', {
            name: $('#reg-name').value.trim(),
            email: $('#reg-email').value.trim(),
            phone: $('#reg-phone').value.trim(),
            password: $('#reg-password').value,
          });
          state.user = data.user;
          state.visitor = false;
          storageRemove('transit_visitor');
          toast(
            data.attachedQuotes
              ? `Compte créé. ${data.attachedQuotes} demande(s) visiteur rattachée(s).`
              : 'Compte créé avec succès.',
            'success'
          );
          navigate('#/account');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    } else if (tab === 'forgot') {
      panel.innerHTML = `
        <form id="form-forgot" class="form">
          <p class="form-intro">Indiquez l’e-mail ou le téléphone du compte. Un lien de réinitialisation vous sera envoyé.</p>
          <div class="field"><label for="fg-identifier">E-mail ou téléphone</label><input id="fg-identifier" name="identifier" type="text" required placeholder="vous@exemple.com" /></div>
          <button class="btn btn-primary btn-block" type="submit">Envoyer le lien</button>
          <p class="form-hint">Le lien expire au bout d’une heure.</p>
        </form>`;
      $('#form-forgot').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('[type="submit"]');
        setLoading(button, true, 'Envoi…');
        try {
          const data = await T.api.post('/api/auth/forgot', { identifier: $('#fg-identifier').value.trim() });
          form.innerHTML = `<div class="notice notice-success">${icon('check', 18)}<span>${esc(data.message)}</span></div>`;
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    } else {
      panel.innerHTML = `
        <form id="form-login" class="form">
          <div class="field"><label for="login-identifier">E-mail ou téléphone</label><input id="login-identifier" name="identifier" type="text" required autocomplete="username" placeholder="vous@exemple.com" /></div>
          <div class="field"><label for="login-password">Mot de passe</label><input id="login-password" name="password" type="password" required autocomplete="current-password" placeholder="Votre mot de passe" /></div>
          <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
          <p class="form-hint">Pas de compte ? <button type="button" class="link-btn" data-auth-tab="register">Créez-en un</button> — il sert uniquement à conserver vos références.</p>
        </form>`;
      $('#form-login').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('[type="submit"]');
        setLoading(button, true, 'Connexion…');
        try {
          const data = await T.api.post('/api/auth/login', {
            identifier: $('#login-identifier').value.trim(),
            password: $('#login-password').value,
          });
          handleLoginSuccess(data.user);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
      $$('[data-auth-tab]', panel).forEach((btn) => {
        btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab));
      });
    }
  }

  function handleLoginSuccess(user) {
    state.user = user;
    state.visitor = false;
    storageRemove('transit_visitor');
    const intent = state.loginIntent;
    state.loginIntent = null;
    toast(`Bienvenue, ${user.name.split(' ')[0]} !`, 'success');
    if (user.role === 'admin') navigate('#/admin');
    else if (intent === 'account') navigate('#/account');
    else navigate('#/home');
  }

  async function loginDemo(kind, button) {
    const credentials =
      kind === 'admin'
        ? { identifier: 'admin@transit.app', password: 'admin123' }
        : { identifier: 'client@transit.app', password: 'client123' };
    setLoading(button, true, 'Connexion…');
    try {
      const data = await T.api.post('/api/auth/login', credentials);
      state.loginIntent = kind === 'admin' ? 'admin' : null;
      handleLoginSuccess(data.user);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  function renderReset(params) {
    cleanupPage();
    const token = params.token || '';
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="brand brand-center">
            <span class="brand-mark">${icon('ship', 26)}</span>
            <span class="brand-name">TRANSIT<small>Ro-Ro &amp; conteneurs</small></span>
          </div>
          <h1>Nouveau mot de passe</h1>
          <p class="form-intro">Choisissez un nouveau mot de passe pour votre compte.</p>
          ${
            token
              ? `<form id="form-reset" class="form">
                  <div class="field"><label for="rs-password">Nouveau mot de passe</label><input id="rs-password" type="password" required autocomplete="new-password" placeholder="6 caractères minimum" /></div>
                  <div class="field"><label for="rs-confirm">Confirmer le mot de passe</label><input id="rs-confirm" type="password" required autocomplete="new-password" placeholder="Répétez le mot de passe" /></div>
                  <button class="btn btn-primary btn-block" type="submit">Modifier le mot de passe</button>
                </form>`
              : `<div class="notice notice-warning">${icon('alert', 18)}<span>Lien de réinitialisation manquant. Refaites une demande depuis la page de connexion.</span></div>`
          }
          <a href="#/login" class="link-arrow">${icon('arrow-left', 16)} Retour à la connexion</a>
        </div>
      </div>`;
    const form = $('#form-reset');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#rs-password').value;
      if (password !== $('#rs-confirm').value) return toast('Les deux mots de passe ne correspondent pas.', 'error');
      const button = form.querySelector('[type="submit"]');
      setLoading(button, true, 'Enregistrement…');
      try {
        const data = await T.api.post('/api/auth/reset', { token, password });
        toast(data.message, 'success');
        navigate('#/login');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(button, false);
      }
    });
  }

  /* -------------------------------- Home --------------------------------- */

  function renderHome() {
    const sliders = state.content.sliders || [];
    const departures = state.content.departures || [];
    const containers = state.content.containers.slice(0, 3);
    const services = state.content.services.slice(0, 4);
    shell(
      `
      <h1 class="sr-only">Transit — transport Ro-Ro et conteneurs</h1>
      ${sliders.length ? sliderHtml(sliders) : heroFallback()}
      ${departures.length ? departuresSection(departures) : ''}
      ${mapSection()}
      ${containerTeaser(containers)}
      ${servicesTeaser(services)}
      ${ctaBand()}
      `,
      { active: 'home' }
    );
    if (sliders.length) initSlider();
    initHomeMap();
  }

  function heroFallback() {
    return `<section class="hero-fallback">
      <div class="container">
        <p class="eyebrow">Transit international</p>
        <h1>Votre véhicule, du porte-à-porte au port.</h1>
        <p>Cotation Ro-Ro et conteneurs, sans création de compte.</p>
        <div class="slide-actions"><a class="btn btn-primary" href="#/roro">Demander une cotation</a></div>
      </div>
    </section>`;
  }

  function sliderHtml(sliders) {
    return `<section class="hero-slider" id="hero-slider" aria-roledescription="carousel" aria-label="Actualités">
      <div class="slides">
        ${sliders
          .map(
            (slider, index) => `
          <div class="slide ${index === 0 ? 'active' : ''}" data-index="${index}">
            <img src="${esc(slider.src)}" alt="${esc(slider.caption)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
            <div class="slide-overlay"></div>
            <div class="slide-content container">
              <p class="slide-eyebrow">Transit &amp; logistique</p>
              <h2 class="slide-title">${esc(slider.caption)}</h2>
              <p class="slide-sub">${esc(slider.sub)}</p>
              <div class="slide-actions">
                <a class="btn btn-primary" href="#/roro">Demander une cotation</a>
                <a class="btn btn-glass" href="#/containers">Conteneurs</a>
              </div>
            </div>
          </div>`
          )
          .join('')}
      </div>
      <button class="slider-arrow prev" type="button" data-slide-prev aria-label="Image précédente">${icon('chevron-left', 24)}</button>
      <button class="slider-arrow next" type="button" data-slide-next aria-label="Image suivante">${icon('chevron-right', 24)}</button>
      <div class="slider-dots">
        ${sliders
          .map(
            (_, index) =>
              `<button class="dot ${index === 0 ? 'active' : ''}" type="button" data-dot="${index}" aria-label="Aller à l’image ${index + 1}"></button>`
          )
          .join('')}
      </div>
      <span class="slide-counter" data-slide-count>1 / ${sliders.length}</span>
    </section>`;
  }

  function initSlider() {
    const root = document.getElementById('hero-slider');
    if (!root) return;
    const slides = $$('.slide', root);
    const dots = $$('[data-dot]', root);
    let index = 0;
    let paused = false;

    const show = (next) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
      const counter = $('[data-slide-count]', root);
      if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
    };
    const start = () => {
      stop();
      state.sliderTimer = setInterval(() => {
        if (!paused) show(index + 1);
      }, 5000);
    };
    const stop = () => {
      if (state.sliderTimer) clearInterval(state.sliderTimer);
      state.sliderTimer = null;
    };

    $('[data-slide-prev]', root).addEventListener('click', () => {
      paused = false;
      show(index - 1);
      start();
    });
    $('[data-slide-next]', root).addEventListener('click', () => {
      paused = false;
      show(index + 1);
      start();
    });
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        paused = false;
        show(Number(dot.dataset.dot));
        start();
      });
    });
    root.addEventListener('mouseenter', () => (paused = true));
    root.addEventListener('mouseleave', () => (paused = false));
    root.addEventListener('touchstart', () => (paused = true), { passive: true });
    root.addEventListener('touchend', () => (paused = false), { passive: true });
    root.addEventListener('focusin', () => (paused = true));
    root.addEventListener('focusout', () => (paused = false));
    start();
  }

  function departuresSection(departures) {
    return `<section class="section departures-section">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Ro-Ro</p>
            <h2>Prochains départs</h2>
          </div>
          <a href="#/roro" class="link-arrow">Tout voir ${icon('arrow-right', 16)}</a>
        </div>
        <div class="departure-scroller">
          ${departures.map(departureCard).join('')}
        </div>
      </div>
    </section>`;
  }

  function departureCard(departure) {
    const from = port(departure.fromPortId);
    const to = port(departure.toPortId);
    return `<a class="departure-card" href="#/roro?departure=${encodeURIComponent(departure.id)}">
      <div class="dep-head">
        ${departurePill(departure.status)}
        <span class="dep-date">${icon('calendar', 15)} ${fmtDate(departure.departureDate)}</span>
      </div>
      <h3>${esc(departure.ship)}</h3>
      <div class="dep-route">
        <div class="dep-port">
          <span class="port-flag">${flag(from ? from.countryCode : '')}</span>
          <div><strong>${esc(from ? from.city || from.name : '—')}</strong><small>${esc(from ? from.country : '')}</small></div>
        </div>
        <span class="dep-arrow">${icon('arrow-right', 18)}</span>
        <div class="dep-port">
          <span class="port-flag">${flag(to ? to.countryCode : '')}</span>
          <div><strong>${esc(to ? to.city || to.name : '—')}</strong><small>${esc(to ? to.country : '')}</small></div>
        </div>
      </div>
      <div class="dep-foot">
        <span>${icon('clock', 15)} Dépôt avant le ${fmtDate(departure.depositDeadline, false)}</span>
        <span class="dep-cta">Cotation ${icon('arrow-right', 14)}</span>
      </div>
    </a>`;
  }

  function mapSection() {
    const loadingCountries = countriesForRole('loading');
    const dischargeCountries = countriesForRole('discharge');
    const from = loadingCountries.includes('Cameroun') ? 'Cameroun' : loadingCountries[0] || '';
    const to = dischargeCountries.includes('Belgique') ? 'Belgique' : dischargeCountries[0] || '';
    return `<section class="section map-home-section">
      <div class="container">
        <div class="split-card">
          <div class="split-card-text">
            <p class="eyebrow">Carte &amp; trajets</p>
            <h2>Choisissez votre pays de départ et d’arrivée</h2>
            <p class="muted">La carte affiche les ports disponibles et le trajet maritime correspondant.</p>
            <div class="route-selects">
              <div class="field">
                <label for="home-from">Pays de départ</label>
                <select id="home-from">${countryOptions(loadingCountries, from)}</select>
              </div>
              <div class="field">
                <label for="home-to">Pays d’arrivée</label>
                <select id="home-to">${countryOptions(dischargeCountries, to)}</select>
              </div>
            </div>
            <a id="home-quote-link" class="btn btn-primary" href="#/roro?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}">
              Demander une cotation Ro-Ro ${icon('arrow-right', 18)}
            </a>
          </div>
          <div class="split-card-map"><div id="home-map" class="map"></div></div>
        </div>
      </div>
    </section>`;
  }

  function curvedRoute(from, to, segments = 64) {
    const points = [];
    const latDiff = to.lat - from.lat;
    const lngDiff = to.lng - from.lng;
    const arc = Math.min(6, Math.abs(latDiff) * 0.22 + Math.abs(lngDiff) * 0.12);
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      points.push([
        from.lat + latDiff * t + Math.sin(Math.PI * t) * arc,
        from.lng + lngDiff * t,
      ]);
    }
    return points;
  }

  function initHomeMap() {
    const mapEl = document.getElementById('home-map');
    if (!mapEl) return;
    const map = T.map.create(mapEl, { center: [7, 5], zoom: 4 });
    if (!map) return;
    const fromSelect = document.getElementById('home-from');
    const toSelect = document.getElementById('home-to');
    const link = document.getElementById('home-quote-link');

    const update = () => {
      const fromCountry = fromSelect.value;
      const toCountry = toSelect.value;
      const fromPorts = state.content.ports.filter((p) => p.role !== 'discharge' && p.country === fromCountry);
      const toPorts = state.content.ports.filter((p) => p.role !== 'loading' && p.country === toCountry);
      const fromPort = fromPorts[0];
      const toPort = toPorts[0];
      map.setPorts([...fromPorts, ...toPorts], false);
      if (fromPort && toPort) {
        map.setRoute(curvedRoute(fromPort, toPort), true);
      } else {
        map.setRoute(null);
        map.fitAll();
      }
      if (link) {
        link.href = `#/roro?from=${encodeURIComponent(fromCountry)}&to=${encodeURIComponent(toCountry)}`;
      }
    };

    fromSelect.addEventListener('change', update);
    toSelect.addEventListener('change', update);
    update();
    map.invalidate();
  }

  function containerTeaser(containers) {
    return `<section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Conteneurs</p>
            <h2>Achetez votre conteneur</h2>
          </div>
          <a href="#/containers" class="link-arrow">Voir le catalogue ${icon('arrow-right', 16)}</a>
        </div>
        <div class="container-grid">
          ${containers.map((container) => containerCard(container, true)).join('')}
        </div>
      </div>
    </section>`;
  }

  function containerCard(container, compact = false) {
    return `<article class="container-card ${compact ? 'compact' : ''}">
      <div class="container-img">
        <img src="${esc(container.image)}" alt="${esc(container.name)}" loading="lazy" />
        <span class="container-tag">${esc(container.shortName || '')}</span>
      </div>
      <div class="container-body">
        <h3>${esc(container.name)}</h3>
        ${compact ? `<p class="container-desc">${esc(container.description)}</p>` : `<p class="container-desc">${esc(container.description)}</p>
        <dl class="specs">
          <div><dt>Dimensions</dt><dd>${esc(container.dimensions)}</dd></div>
          <div><dt>Volume</dt><dd>${esc(container.volume)}</dd></div>
        </dl>`}
        ${
          compact
            ? `<a class="btn btn-outline btn-block" href="#/containers?container=${encodeURIComponent(container.id)}">Demander un prix ${icon('arrow-right', 16)}</a>`
            : `<button class="btn btn-primary btn-block" type="button" data-select-container="${esc(container.id)}">Demander un prix ${icon('arrow-right', 16)}</button>`
        }
      </div>
    </article>`;
  }

  function servicesTeaser(services) {
    return `<section class="section services-section">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Autres services</p>
            <h2>Un accompagnement complet</h2>
          </div>
          <a href="#/services" class="link-arrow">Tous les services ${icon('arrow-right', 16)}</a>
        </div>
        <div class="service-grid">
          ${services
            .map(
              (service) => `<a class="service-card" href="#/service/${encodeURIComponent(service.id)}">
                <span class="service-icon">${esc(service.icon || '🚚')}</span>
                <h3>${esc(service.name)}</h3>
                <p>${esc(service.description)}</p>
                <span class="link-arrow">Demander une cotation ${icon('arrow-right', 14)}</span>
              </a>`
            )
            .join('')}
        </div>
      </div>
    </section>`;
  }

  function ctaBand() {
    return `<section class="cta-band">
      <div class="container cta-inner">
        <div>
          <h2>Un projet de transport ?</h2>
          <p>Notre équipe vous répond sous 24 h ouvrées, du lundi au samedi.</p>
        </div>
        <div class="cta-actions">
          <a class="btn btn-amber" href="#/roro">Cotation Ro-Ro</a>
          <a class="btn btn-glass" href="mailto:contact@transit.app">${icon('mail', 18)} contact@transit.app</a>
        </div>
      </div>
    </section>`;
  }

  /* --------------------------- Location widget --------------------------- */

  function createLocationWidget(cfg) {
    const map = T.map.create(cfg.mapEl, { center: [4.5, 10], zoom: 5 });
    if (!map) return null;
    let location = null;
    let distance = null;
    let routeVersion = 0;

    const setPanel = (html) => {
      if (cfg.panelEl) cfg.panelEl.innerHTML = html;
    };

    const idle = () =>
      setPanel(
        `<div class="distance-idle">${icon('route', 24)}<div><strong>Distance jusqu’au port</strong><p>Activez le GPS ou recherchez votre adresse : l’itinéraire et les kilomètres s’affichent ici.</p></div></div>`
      );

    const locating = () =>
      setPanel(
        `<div class="distance-loading"><span class="spinner"></span><div><strong>Localisation en cours…</strong><p>Acceptez l’autorisation du navigateur.</p></div></div>`
      );

    const routing = () =>
      setPanel(
        `<div class="distance-loading"><span class="spinner"></span><div><strong>Calcul de l’itinéraire…</strong><p>Recherche de la route routière vers le port.</p></div></div>`
      );

    const formatDuration = (minutes) => {
      if (!minutes) return '';
      const total = Math.round(minutes);
      if (total < 60) return `${total} min`;
      const hours = Math.floor(total / 60);
      const mins = total % 60;
      return `${hours} h ${String(mins).padStart(2, '0')}`;
    };

    const success = (result, fallback = false) => {
      const duration = formatDuration(result.durationMin);
      setPanel(`<div class="distance-result">
        <div class="distance-main"><span class="distance-km">${fmtNumber(result.km, 1)}</span><span class="distance-unit">km</span></div>
        <div class="distance-meta">${duration ? `≈ ${duration} en voiture · ` : ''}${result.mode === 'road' ? 'itinéraire routier' : 'distance à vol d’oiseau'}</div>
        ${fallback ? '<p class="distance-warn">Itinéraire détaillé indisponible : distance estimée à vol d’oiseau.</p>' : ''}
        <p class="distance-note">${icon('check', 15)} Distance jointe à votre demande de cotation</p>
      </div>`);
    };

    const noRoute = () =>
      setPanel(`<div class="distance-warning">${icon('alert', 24)}<div><strong>Aucun trajet routier possible</strong><p>Entre votre position et ce port. Contactez le prestataire pour organiser la prise en charge.</p><a href="mailto:contact@transit.app" class="link-arrow">Contacter le prestataire ${icon('arrow-right', 14)}</a></div></div>`);

    const error = (message) =>
      setPanel(`<div class="distance-warning">${icon('alert', 24)}<div><strong>Localisation impossible</strong><p>${esc(message)}</p></div></div>`);

    async function routeToPort() {
      const target = cfg.getPort();
      const version = ++routeVersion;
      if (!target) {
        idle();
        return;
      }
      map.setPorts([target], false);
      if (!location) {
        map.setView(target.lat, target.lng, 9);
        idle();
        return;
      }
      routing();
      map.setClient(location.lat, location.lng, location.city || location.name || 'Votre position');
      try {
        const result = await T.geo.route(location, target);
        if (version !== routeVersion) return;
        distance = result;
        map.setRoute(result.coords, true);
        success(result);
      } catch (err) {
        if (version !== routeVersion) return;
        if (String(err.message).includes('no-route')) {
          distance = null;
          map.setRoute(null);
          noRoute();
        } else {
          const km = T.geo.haversine(location, target);
          distance = {
            km,
            durationMin: null,
            coords: [
              [location.lat, location.lng],
              [target.lat, target.lng],
            ],
            mode: 'straight',
          };
          map.setRoute(distance.coords, true);
          success(distance, true);
        }
      }
      if (cfg.onLocation) cfg.onLocation({ location, distance });
    }

    async function setLocation(loc, label) {
      location = loc;
      if (cfg.inputEl) cfg.inputEl.value = label || loc.displayName || loc.name || '';
      map.setClient(loc.lat, loc.lng, loc.city || loc.name || 'Votre position');
      map.fitAll();
      await routeToPort();
    }

    async function refresh() {
      const target = cfg.getPort();
      if (!target) {
        map.setPorts([], false);
        idle();
        return;
      }
      map.setPorts([target], false);
      if (!location) {
        map.setView(target.lat, target.lng, 9);
        idle();
        return;
      }
      await routeToPort();
    }

    /* Certains navigateurs intègrent l’application dans un cadre (iframe) qui
       interdit la géolocalisation : on le détecte avant de lancer la demande,
       pour proposer directement la saisie manuelle au lieu d’un refus brutal. */
    function geolocationAllowed() {
      if (!navigator.geolocation) return Promise.resolve(false);
      if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(true);
      return navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => status.state !== 'denied')
        .catch(() => true);
    }

    function geolocationUnavailable(message) {
      if (cfg.locateBtn) setLoading(cfg.locateBtn, false);
      idle();
      setPanel(
        `<div class="distance-idle">${icon('search', 24)}<div><strong>Saisissez votre ville</strong>` +
          `<p>${message || 'La localisation automatique est bloquée ici, mais la recherche manuelle donne exactement le même résultat.'}</p></div></div>`
      );
      if (cfg.inputEl) {
        cfg.inputEl.focus();
        cfg.inputEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      toast('Saisissez votre ville : le calcul de distance fonctionne pareil.', 'info');
    }

    async function locate() {
      if (!navigator.geolocation) {
        geolocationUnavailable('La géolocalisation n’est pas prise en charge par ce navigateur.');
        return;
      }
      const allowed = await geolocationAllowed();
      if (!allowed) {
        geolocationUnavailable('La localisation automatique est désactivée dans ce navigateur.');
        return;
      }
      locating();
      if (cfg.locateBtn) setLoading(cfg.locateBtn, true, 'Localisation…');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          let loc = { lat, lng, name: 'Votre position', displayName: 'Votre position', city: '', country: '', countryCode: '' };
          try {
            const reversed = await T.geo.reverse(lat, lng);
            loc = { ...loc, ...reversed, lat, lng };
          } catch (err) {
            /* keep raw coordinates */
          }
          if (cfg.inputEl) cfg.inputEl.value = loc.city ? `${loc.city}, ${loc.country}`.replace(/, $/, '') : 'Votre position';
          if (cfg.locateBtn) setLoading(cfg.locateBtn, false);
          await setLocation(loc, cfg.inputEl ? cfg.inputEl.value : loc.displayName);
          toast('Position détectée. Distance calculée jusqu’au port.', 'success');
        },
        (err) => {
          if (cfg.locateBtn) setLoading(cfg.locateBtn, false);
          const messages = {
            1: 'Localisation non autorisée ici. Saisissez votre ville ci-dessous.',
            2: 'Position indisponible. Saisissez votre ville ci-dessous.',
            3: 'Délai de localisation dépassé. Saisissez votre ville ci-dessous.',
          };
          geolocationUnavailable(messages[err.code] || 'Localisation impossible. Saisissez votre ville ci-dessous.');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    }

    async function search() {
      const query = cfg.inputEl ? cfg.inputEl.value.trim() : '';
      if (!query) {
        toast('Saisissez une ville ou une adresse.', 'error');
        return;
      }
      locating();
      if (cfg.searchBtn) setLoading(cfg.searchBtn, true, 'Recherche…');
      try {
        const result = await T.geo.search(query);
        if (!result) {
          error('Adresse introuvable. Essayez « Ville, Pays ».');
          return;
        }
        await setLocation(result, result.displayName);
      } catch (err) {
        if (String(err.message).includes('offline-search')) {
          error('Ville introuvable. Essayez « Douala », « Yaoundé » ou « Ville, Pays ».');
        } else {
          error('Recherche impossible. Vérifiez votre connexion Internet.');
        }
      } finally {
        if (cfg.searchBtn) setLoading(cfg.searchBtn, false);
      }
    }

    if (cfg.locateBtn) cfg.locateBtn.addEventListener('click', locate);
    if (cfg.searchBtn) cfg.searchBtn.addEventListener('click', search);
    if (cfg.inputEl) {
      cfg.inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          search();
        }
      });
    }
    map.invalidate();
    idle();
    refresh();

    return {
      map,
      setLocation,
      refresh,
      routeToPort,
      getLocation: () => location,
      getDistance: () => distance,
    };
  }

  /* -------------------------------- Ro-Ro -------------------------------- */

  function initRoroState(params) {
    const loadingPorts = state.content.ports.filter((p) => p.role !== 'discharge');
    const dischargePorts = state.content.ports.filter((p) => p.role !== 'loading');
    const s = {
      departureId: '',
      fromCountry: '',
      toCountry: '',
      fromPortId: '',
      toPortId: '',
      location: null,
      distance: null,
      vehicle: null,
    };
    if (params.departure) {
      const departure = state.content.departures.find((d) => d.id === params.departure);
      if (departure) {
        const from = port(departure.fromPortId);
        const to = port(departure.toPortId);
        s.departureId = departure.id;
        s.fromPortId = departure.fromPortId;
        s.toPortId = departure.toPortId;
        s.fromCountry = from ? from.country : '';
        s.toCountry = to ? to.country : '';
      }
    }
    if (params.from) {
      const found = loadingPorts.find((p) => p.country === params.from);
      if (found) {
        s.fromPortId = found.id;
        s.fromCountry = found.country;
      }
    }
    if (params.to) {
      const found = dischargePorts.find((p) => p.country === params.to);
      if (found) {
        s.toPortId = found.id;
        s.toCountry = found.country;
      }
    }
    if (!s.fromPortId) {
      const found = loadingPorts.find((p) => p.country === 'Cameroun') || loadingPorts[0];
      if (found) {
        s.fromPortId = found.id;
        s.fromCountry = found.country;
      }
    }
    if (!s.toPortId) {
      const found = dischargePorts.find((p) => p.country === 'Belgique') || dischargePorts[0];
      if (found) {
        s.toPortId = found.id;
        s.toCountry = found.country;
      }
    }
    if (state.prefillVehicle) {
      s.vehicle = state.prefillVehicle;
      state.prefillVehicle = null;
    }
    return s;
  }

  function renderRoro(params) {
    state.roro = initRoroState(params || {});
    const s = state.roro;
    const fromPort = port(s.fromPortId);
    const toPort = port(s.toPortId);
    const departure = state.content.departures.find((d) => d.id === s.departureId);
    const vehicle = s.vehicle || {};
    const contact = state.user ? { name: state.user.name, email: state.user.email, phone: state.user.phone } : loadContact();
    const loadingCountries = countriesForRole('loading');
    const dischargeCountries = countriesForRole('discharge');
    const departures = state.content.departures;

    shell(
      `
      <section class="page-hero">
        <div class="container">
          <p class="eyebrow">Ro-Ro · Transit de véhicules</p>
          <h1>Envoyez votre véhicule<br />partout dans le monde</h1>
          <p class="lead">Choisissez un trajet, localisez-vous et obtenez la distance jusqu’au port. Votre demande de cotation part sans compte.</p>
        </div>
      </section>
      <div class="container page-grid">
        <div class="page-col">
          <div class="card route-card">
            <div class="card-head">
              <div>
                <h2>${icon('route', 20)} Votre trajet</h2>
                <p>Choisissez un départ ou composez votre propre trajet.</p>
              </div>
            </div>
            <div class="field">
              <label for="roro-departure">Départ Ro-Ro (facultatif)</label>
              <select id="roro-departure">
                <option value="">— Aucun départ sélectionné —</option>
                ${departures
                  .map(
                    (d) =>
                      `<option value="${esc(d.id)}" ${d.id === s.departureId ? 'selected' : ''}>${esc(d.ship)} · ${fmtDate(d.departureDate)} · ${esc(port(d.fromPortId) ? port(d.fromPortId).city : '')} → ${esc(port(d.toPortId) ? port(d.toPortId).city : '')}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="field-grid two">
              <div class="field">
                <label for="roro-from-country">Pays de départ</label>
                <select id="roro-from-country">${countryOptions(loadingCountries, s.fromCountry)}</select>
              </div>
              <div class="field">
                <label for="roro-to-country">Pays d’arrivée</label>
                <select id="roro-to-country">${countryOptions(dischargeCountries, s.toCountry)}</select>
              </div>
            </div>
            <div class="field-grid two">
              <div class="field">
                <label for="roro-from-port">Port de chargement</label>
                <select id="roro-from-port"></select>
              </div>
              <div class="field">
                <label for="roro-to-port">Port de déchargement</label>
                <select id="roro-to-port"></select>
              </div>
            </div>
            <div id="roro-summary" class="route-summary-wrap"></div>
          </div>

          <div class="card map-card">
            <div class="card-head">
              <div>
                <h2>${icon('map', 20)} GPS &amp; distance jusqu’au port</h2>
                <p>Utilisez votre position ou saisissez votre ville : l’itinéraire s’affiche sur la carte.</p>
              </div>
            </div>
            <div class="locate-row">
              <input id="roro-address" type="text" placeholder="Votre ville ou adresse (ex. Yaoundé, Cameroun)" autocomplete="street-address" />
              <button id="roro-search" class="btn btn-secondary" type="button">${icon('search', 18)}<span>Rechercher</span></button>
            </div>
            <div id="roro-map" class="map map-large"></div>
            <div id="roro-distance" class="distance-panel" aria-live="polite"></div>
            <button id="roro-locate" class="btn btn-locate" type="button">${icon('navigation', 20)}<span>Me localiser</span></button>
          </div>
        </div>

        <div class="page-col">
          <form class="card form-card" id="roro-form" novalidate>
            <div class="card-head">
              <div>
                <h2>${icon('ship', 20)} Votre véhicule</h2>
                <p>Références et coordonnées pour la cotation.</p>
              </div>
            </div>
            ${
              state.user && state.user.vehicles && state.user.vehicles.length
                ? `<div class="field"><label for="roro-saved-vehicle">Référence enregistrée</label>
                    <select id="roro-saved-vehicle">
                      <option value="">— Choisir un véhicule enregistré —</option>
                      ${state.user.vehicles
                        .map(
                          (v) =>
                            `<option value="${esc(v.id)}">${esc(v.brand)} ${esc(v.model)}${v.vin ? ` · ${esc(v.vin)}` : ''}</option>`
                        )
                        .join('')}
                    </select>
                  </div>`
                : ''
            }
            <div class="field-grid two">
              <div class="field">
                <label for="roro-type">Type de véhicule</label>
                <select id="roro-type">
                  ${['Voiture', '4x4', 'Pick-up', 'Utilitaire', 'Engin', 'Moto', 'Autre']
                    .map((type) => option(type, type, vehicle.type))
                    .join('')}
                </select>
              </div>
              <div class="field">
                <label for="roro-year">Année <span class="label-optional">facultatif</span></label>
                <input id="roro-year" type="number" min="1950" max="2030" value="${esc(vehicle.year || '')}" placeholder="2020" />
              </div>
            </div>
            <div class="field-grid two">
              <div class="field"><label for="roro-brand">Marque</label><input id="roro-brand" type="text" value="${esc(vehicle.brand || '')}" placeholder="Toyota" /></div>
              <div class="field"><label for="roro-model">Modèle</label><input id="roro-model" type="text" value="${esc(vehicle.model || '')}" placeholder="Land Cruiser" /></div>
            </div>
            <div class="field">
              <label for="roro-vin">Châssis (VIN) <span class="label-optional">recommandé</span></label>
              <input id="roro-vin" type="text" value="${esc(vehicle.vin || '')}" placeholder="JTEAB3CD300000001" />
            </div>

            <div class="divider"><span>Coordonnées</span></div>
            <div class="field-grid two">
              <div class="field"><label for="roro-name">Nom complet</label><input id="roro-name" type="text" value="${esc(contact.name || '')}" placeholder="Votre nom" /></div>
              <div class="field"><label for="roro-phone">Téléphone / WhatsApp</label><input id="roro-phone" type="tel" value="${esc(contact.phone || '')}" placeholder="+237 6 00 00 00 00" /></div>
            </div>
            <div class="field"><label for="roro-email">E-mail <span class="label-optional">ou téléphone</span></label><input id="roro-email" type="email" value="${esc(contact.email || '')}" placeholder="vous@exemple.com" /></div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('check', 20)} Envoyer ma demande de cotation</button>
            <p class="form-hint">${icon('lock', 14)} Aucun compte requis. Un numéro de demande vous sera confirmé à l’écran.</p>
          </form>
        </div>
      </div>
      `,
      { active: 'roro' }
    );
    bindRoro();
  }

  function routeSummaryHtml(from, to, departure) {
    if (!from || !to) return '';
    return `<div class="route-summary">
      <div class="route-point">
        <span class="route-label">Chargement</span>
        <strong>${flag(from.countryCode)} ${esc(from.name)}</strong>
        <small>${esc(from.city)}, ${esc(from.country)}</small>
      </div>
      <span class="route-line">${icon('arrow-right', 18)}</span>
      <div class="route-point route-point-end">
        <span class="route-label">Déchargement</span>
        <strong>${flag(to.countryCode)} ${esc(to.name)}</strong>
        <small>${esc(to.city)}, ${esc(to.country)}</small>
      </div>
      ${
        departure
          ? `<div class="route-departure">${icon('ship', 16)} <span><strong>${esc(departure.ship)}</strong> · départ ${fmtDate(departure.departureDate)} · dépôt avant le ${fmtDate(departure.depositDeadline, false)}</span></div>`
          : ''
      }
    </div>`;
  }

  function bindRoro() {
    const s = state.roro;
    const widget = createLocationWidget({
      mapEl: document.getElementById('roro-map'),
      inputEl: document.getElementById('roro-address'),
      locateBtn: document.getElementById('roro-locate'),
      searchBtn: document.getElementById('roro-search'),
      panelEl: document.getElementById('roro-distance'),
      getPort: () => port(s.fromPortId),
      onLocation: ({ location, distance }) => {
        s.location = location;
        s.distance = distance;
      },
    });
    state.roroWidget = widget;

    const fromCountrySelect = document.getElementById('roro-from-country');
    const toCountrySelect = document.getElementById('roro-to-country');
    const fromPortSelect = document.getElementById('roro-from-port');
    const toPortSelect = document.getElementById('roro-to-port');
    const departureSelect = document.getElementById('roro-departure');
    const summaryEl = document.getElementById('roro-summary');

    const fillPorts = () => {
      const fromPorts = state.content.ports.filter((p) => p.role !== 'discharge' && p.country === s.fromCountry);
      const toPorts = state.content.ports.filter((p) => p.role !== 'loading' && p.country === s.toCountry);
      fromPortSelect.innerHTML = fromPorts
        .map((p) => option(p.id, `${p.name} — ${p.city || p.country}`, s.fromPortId))
        .join('');
      toPortSelect.innerHTML = toPorts.map((p) => option(p.id, `${p.name} — ${p.city || p.country}`, s.toPortId)).join('');
      if (fromPorts.length && !fromPorts.some((p) => p.id === s.fromPortId)) s.fromPortId = fromPorts[0].id;
      if (toPorts.length && !toPorts.some((p) => p.id === s.toPortId)) s.toPortId = toPorts[0].id;
    };

    const updateSummary = () => {
      const departure = state.content.departures.find((d) => d.id === s.departureId);
      summaryEl.innerHTML = routeSummaryHtml(port(s.fromPortId), port(s.toPortId), departure);
    };

    const refreshAll = async () => {
      fillPorts();
      updateSummary();
      if (widget) await widget.refresh();
    };

    departureSelect.addEventListener('change', async () => {
      const departure = state.content.departures.find((d) => d.id === departureSelect.value);
      if (departure) {
        const from = port(departure.fromPortId);
        const to = port(departure.toPortId);
        s.departureId = departure.id;
        s.fromPortId = departure.fromPortId;
        s.toPortId = departure.toPortId;
        s.fromCountry = from ? from.country : s.fromCountry;
        s.toCountry = to ? to.country : s.toCountry;
        fromCountrySelect.value = s.fromCountry;
        toCountrySelect.value = s.toCountry;
      } else {
        s.departureId = '';
      }
      await refreshAll();
    });

    fromCountrySelect.addEventListener('change', async () => {
      s.fromCountry = fromCountrySelect.value;
      const first = state.content.ports.find((p) => p.role !== 'discharge' && p.country === s.fromCountry);
      s.fromPortId = first ? first.id : '';
      s.departureId = '';
      departureSelect.value = '';
      await refreshAll();
    });

    toCountrySelect.addEventListener('change', async () => {
      s.toCountry = toCountrySelect.value;
      const first = state.content.ports.find((p) => p.role !== 'loading' && p.country === s.toCountry);
      s.toPortId = first ? first.id : '';
      s.departureId = '';
      departureSelect.value = '';
      await refreshAll();
    });

    fromPortSelect.addEventListener('change', async () => {
      s.fromPortId = fromPortSelect.value;
      s.departureId = '';
      departureSelect.value = '';
      await refreshAll();
    });

    toPortSelect.addEventListener('change', async () => {
      s.toPortId = toPortSelect.value;
      s.departureId = '';
      departureSelect.value = '';
      await refreshAll();
    });

    const savedSelect = document.getElementById('roro-saved-vehicle');
    if (savedSelect) {
      savedSelect.addEventListener('change', () => {
        const vehicle = (state.user.vehicles || []).find((v) => v.id === savedSelect.value);
        if (!vehicle) return;
        const typeSelect = document.getElementById('roro-type');
        const knownType = Array.from(typeSelect.options).some((opt) => opt.value === vehicle.type);
        typeSelect.value = knownType ? vehicle.type : 'Autre';
        document.getElementById('roro-brand').value = vehicle.brand || '';
        document.getElementById('roro-model').value = vehicle.model || '';
        document.getElementById('roro-vin').value = vehicle.vin || '';
        document.getElementById('roro-year').value = vehicle.year || '';
      });
    }

    document.getElementById('roro-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const addressInput = document.getElementById('roro-address');
      const fromPort = port(s.fromPortId);
      const toPort = port(s.toPortId);
      const vehicle = {
        type: document.getElementById('roro-type').value,
        brand: document.getElementById('roro-brand').value.trim(),
        model: document.getElementById('roro-model').value.trim(),
        vin: document.getElementById('roro-vin').value.trim().toUpperCase(),
        year: document.getElementById('roro-year').value,
      };
      const contact = {
        name: document.getElementById('roro-name').value.trim(),
        phone: document.getElementById('roro-phone').value.trim(),
        email: document.getElementById('roro-email').value.trim(),
        city: s.location && s.location.city ? s.location.city : addressInput.value.trim(),
        country: s.location && s.location.country ? s.location.country : fromPort ? fromPort.country : '',
      };
      if (!fromPort || !toPort) return toast('Sélectionnez un port de chargement et un port de déchargement.', 'error');
      if (!vehicle.brand && !vehicle.model && !vehicle.vin) return toast('Renseignez au moins la marque, le modèle ou le châssis.', 'error');
      if (!contact.name) return toast('Indiquez votre nom.', 'error');
      if (!contact.phone && !contact.email) return toast('Indiquez un téléphone ou un e-mail.', 'error');

      setLoading(button, true, 'Envoi…');
      try {
        const currentQuery = addressInput.value.trim();
        const matchesLocation =
          s.location &&
          (currentQuery === s.location.displayName ||
            currentQuery === `${s.location.city}, ${s.location.country}` ||
            currentQuery === s.location.city);
        if (currentQuery && (!s.location || !matchesLocation)) {
          try {
            const result = await T.geo.search(currentQuery);
            if (result && widget) await widget.setLocation(result, result.displayName);
          } catch (err) {
            /* submit without distance */
          }
        }
        const departure = state.content.departures.find((d) => d.id === s.departureId);
        const payload = {
          departureId: s.departureId || undefined,
          fromPortId: s.fromPortId,
          toPortId: s.toPortId,
          ship: departure ? departure.ship : '',
          vehicle,
          pickup: {
            city: contact.city,
            country: contact.country,
            address: addressInput.value.trim(),
          },
        };
        const distance = s.distance && s.location
          ? {
              km: s.distance.km,
              durationMin: s.distance.durationMin,
              mode: s.distance.mode,
              from: { lat: s.location.lat, lng: s.location.lng, name: s.location.name || s.location.city || 'Position' },
              to: { lat: fromPort.lat, lng: fromPort.lng, name: fromPort.name },
            }
          : null;
        const data = await T.api.post('/api/quotes', { type: 'roro', contact, payload, distance });
        state.lastQuote = data.quote;
        saveContact(contact);
        if (state.user) await refreshUser();
        navigate('#/confirmation');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(button, false);
      }
    });

    refreshAll();
  }

  /* ------------------------------ Containers ----------------------------- */

  function initContainerState(params) {
    const s = {
      containerId: 'c20',
      quantity: 1,
      condition: 'neuf',
      deliveryCountry: 'Cameroun',
      deliveryCity: '',
      usage: '',
      desiredDate: '',
      location: null,
      distance: null,
    };
    if (params.container) s.containerId = params.container;
    if (state.prefillContainer) {
      const match = state.content.containers.find((c) => c.name === state.prefillContainer.type);
      s.containerId = match ? match.id : s.containerId;
      s.condition = state.prefillContainer.condition || s.condition;
      state.prefillContainer = null;
    }
    return s;
  }

  function containerTargetPort(s) {
    const countryPorts = state.content.ports.filter((p) => p.country === s.deliveryCountry);
    if (s.location) {
      const pool = countryPorts.length ? countryPorts : state.content.ports;
      return T.geo.nearestPort(s.location.lat, s.location.lng, pool);
    }
    return countryPorts[0] || state.content.ports[0];
  }

  function renderContainers(params) {
    state.container = initContainerState(params || {});
    const s = state.container;
    const containers = state.content.containers;
    const contact = state.user ? { name: state.user.name, email: state.user.email, phone: state.user.phone } : loadContact();
    shell(
      `
      <section class="page-hero">
        <div class="container">
          <p class="eyebrow">Conteneurs · Achat &amp; livraison</p>
          <h1>Conteneurs neufs<br />et d’occasion</h1>
          <p class="lead">Choisissez un type de conteneur et demandez votre prix. Aucun paiement en ligne : le prestataire vous répond avec une cotation.</p>
        </div>
      </section>
      <div class="container">
        <div class="section-head catalog-head">
          <div>
            <p class="eyebrow">Catalogue</p>
            <h2>Nos conteneurs</h2>
          </div>
          <span class="catalog-count">${containers.length} type(s) disponible(s)</span>
        </div>
        <div class="container-grid catalog-grid">
          ${containers.map((container) => containerCard(container, false)).join('')}
        </div>

        <div class="container-form-layout" id="container-form">
          <form class="card form-card" id="container-form-el" novalidate>
            <div class="card-head">
              <div>
                <h2>${icon('box', 20)} Demande de prix</h2>
                <p>Remplissez le formulaire : le prestataire vous répond par e-mail ou WhatsApp.</p>
              </div>
            </div>
            ${
              state.user && state.user.containers && state.user.containers.length
                ? `<div class="field"><label for="ct-saved">Référence enregistrée</label>
                    <select id="ct-saved">
                      <option value="">— Choisir une référence —</option>
                      ${state.user.containers
                        .map(
                          (c) =>
                            `<option value="${esc(c.id)}">${esc(c.type)}${c.condition ? ` · ${esc(c.condition)}` : ''}</option>`
                        )
                        .join('')}
                    </select>
                  </div>`
                : ''
            }
            <div class="field-grid two">
              <div class="field">
                <label for="ct-type">Type de conteneur</label>
                <select id="ct-type">
                  ${containers.map((c) => option(c.id, c.name, s.containerId)).join('')}
                </select>
              </div>
              <div class="field">
                <label for="ct-quantity">Quantité</label>
                <input id="ct-quantity" type="number" min="1" max="100" value="1" />
              </div>
            </div>
            <div class="field">
              <label>État souhaité</label>
              <div class="segmented">
                <label class="segmented-item"><input type="radio" name="ct-condition" value="neuf" checked /><span>Neuf</span></label>
                <label class="segmented-item"><input type="radio" name="ct-condition" value="occasion" /><span>Occasion</span></label>
              </div>
            </div>
            <div class="field-grid two">
              <div class="field">
                <label for="ct-country">Pays de livraison</label>
                <select id="ct-country">${countryOptions(allCountries(), s.deliveryCountry)}</select>
              </div>
              <div class="field">
                <label for="ct-city">Ville / adresse de livraison</label>
                <input id="ct-city" type="text" placeholder="Douala, Bonabéri…" />
              </div>
            </div>
            <div class="field-grid two">
              <div class="field"><label for="ct-usage">Usage prévu <span class="label-optional">facultatif</span></label><input id="ct-usage" type="text" placeholder="Stockage, commerce…" /></div>
              <div class="field"><label for="ct-date">Date souhaitée <span class="label-optional">facultatif</span></label><input id="ct-date" type="date" /></div>
            </div>

            <div class="card map-card inner-map-card">
              <div class="card-head">
                <div>
                  <h3>${icon('map', 18)} Distance jusqu’au port</h3>
                  <p>Même outil GPS que pour le Ro-Ro : la distance est jointe à votre demande.</p>
                </div>
              </div>
              <div class="locate-row">
                <input id="ct-address" type="text" placeholder="Rechercher une ville ou une adresse…" />
                <button id="ct-search" class="btn btn-secondary" type="button">${icon('search', 18)}<span>Rechercher</span></button>
              </div>
              <div id="ct-map" class="map"></div>
              <div id="ct-distance" class="distance-panel" aria-live="polite"></div>
              <button id="ct-locate" class="btn btn-locate" type="button">${icon('navigation', 20)}<span>Me localiser</span></button>
            </div>

            <div class="divider"><span>Coordonnées</span></div>
            <div class="field-grid two">
              <div class="field"><label for="ct-name">Nom complet</label><input id="ct-name" type="text" value="${esc(contact.name || '')}" placeholder="Votre nom" /></div>
              <div class="field"><label for="ct-phone">Téléphone / WhatsApp</label><input id="ct-phone" type="tel" value="${esc(contact.phone || '')}" placeholder="+237 6 00 00 00 00" /></div>
            </div>
            <div class="field"><label for="ct-email">E-mail <span class="label-optional">ou téléphone</span></label><input id="ct-email" type="email" value="${esc(contact.email || '')}" placeholder="vous@exemple.com" /></div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('check', 20)} Envoyer ma demande de prix</button>
            <p class="form-hint">${icon('lock', 14)} Aucun compte requis. Un numéro de demande vous sera confirmé.</p>
          </form>
        </div>
      </div>
      `,
      { active: 'containers' }
    );
    bindContainers();
  }

  function bindContainers() {
    const s = state.container;
    const widget = createLocationWidget({
      mapEl: document.getElementById('ct-map'),
      inputEl: document.getElementById('ct-address'),
      locateBtn: document.getElementById('ct-locate'),
      searchBtn: document.getElementById('ct-search'),
      panelEl: document.getElementById('ct-distance'),
      getPort: () => containerTargetPort(s),
      onLocation: ({ location, distance }) => {
        s.location = location;
        s.distance = distance;
      },
    });
    state.containerWidget = widget;

    $$('[data-select-container]').forEach((button) => {
      button.addEventListener('click', () => {
        document.getElementById('ct-type').value = button.dataset.selectContainer;
        document.getElementById('container-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('Type de conteneur sélectionné.', 'success');
      });
    });

    document.getElementById('ct-country').addEventListener('change', async (event) => {
      s.deliveryCountry = event.target.value;
      if (widget) await widget.refresh();
    });

    const savedSelect = document.getElementById('ct-saved');
    if (savedSelect) {
      savedSelect.addEventListener('change', () => {
        const ref = (state.user.containers || []).find((c) => c.id === savedSelect.value);
        if (!ref) return;
        const match = state.content.containers.find((c) => c.name === ref.type);
        if (match) document.getElementById('ct-type').value = match.id;
        const radio = document.querySelector(`input[name="ct-condition"][value="${ref.condition}"]`);
        if (radio) radio.checked = true;
      });
    }

    document.getElementById('container-form-el').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const container = state.content.containers.find((c) => c.id === document.getElementById('ct-type').value);
      const condition = (document.querySelector('input[name="ct-condition"]:checked') || {}).value;
      const addressInput = document.getElementById('ct-address');
      const cityInput = document.getElementById('ct-city');
      const contact = {
        name: document.getElementById('ct-name').value.trim(),
        phone: document.getElementById('ct-phone').value.trim(),
        email: document.getElementById('ct-email').value.trim(),
        city: cityInput.value.trim() || (s.location && s.location.city) || '',
        country: document.getElementById('ct-country').value,
      };
      if (!container) return toast('Sélectionnez un type de conteneur.', 'error');
      if (!contact.city) return toast('Indiquez la ville de livraison.', 'error');
      if (!contact.name) return toast('Indiquez votre nom.', 'error');
      if (!contact.phone && !contact.email) return toast('Indiquez un téléphone ou un e-mail.', 'error');

      setLoading(button, true, 'Envoi…');
      try {
        const distanceQuery = addressInput.value.trim() || cityInput.value.trim();
        const matchesLocation =
          s.location &&
          (distanceQuery === s.location.displayName ||
            distanceQuery === `${s.location.city}, ${s.location.country}` ||
            distanceQuery === s.location.city);
        if (distanceQuery && (!s.location || !matchesLocation)) {
          try {
            const result = await T.geo.search(distanceQuery);
            if (result && widget) await widget.setLocation(result, result.displayName);
          } catch (err) {
            /* submit without distance */
          }
        }
        const payload = {
          containerId: container.id,
          quantity: Math.max(1, Number(document.getElementById('ct-quantity').value) || 1),
          condition,
          delivery: {
            city: contact.city,
            country: contact.country,
            address: addressInput.value.trim() || cityInput.value.trim(),
          },
          usage: document.getElementById('ct-usage').value.trim(),
          desiredDate: document.getElementById('ct-date').value,
        };
        const distance = s.distance && s.location
          ? {
              km: s.distance.km,
              durationMin: s.distance.durationMin,
              mode: s.distance.mode,
              from: { lat: s.location.lat, lng: s.location.lng, name: s.location.name || s.location.city || 'Position' },
              to: (() => {
                const target = containerTargetPort(s);
                return target ? { lat: target.lat, lng: target.lng, name: target.name } : null;
              })(),
            }
          : null;
        const data = await T.api.post('/api/quotes', { type: 'container', contact, payload, distance });
        state.lastQuote = data.quote;
        saveContact(contact);
        if (state.user) await refreshUser();
        navigate('#/confirmation');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(button, false);
      }
    });

    if (widget) widget.refresh();
  }

  /* ------------------------------- Services ------------------------------ */

  function renderServices() {
    const services = state.content.services;
    shell(
      `
      <section class="page-hero">
        <div class="container">
          <p class="eyebrow">Autres services</p>
          <h1>Un accompagnement<br />de bout en bout</h1>
          <p class="lead">Dédouanement, transport routier, assurance cargo ou groupage : demandez votre cotation pour chaque service.</p>
        </div>
      </section>
      <div class="container">
        <div class="service-grid service-grid-large">
          ${services
            .map(
              (service) => `<a class="service-card" href="#/service/${encodeURIComponent(service.id)}">
                <span class="service-icon">${esc(service.icon || '🚚')}</span>
                <h3>${esc(service.name)}</h3>
                <p>${esc(service.description)}</p>
                <span class="link-arrow">Demander une cotation ${icon('arrow-right', 14)}</span>
              </a>`
            )
            .join('')}
        </div>
      </div>
      `,
      { active: 'services' }
    );
  }

  function renderServiceQuote(id) {
    const service = state.content.services.find((s) => s.id === id);
    if (!service) {
      shell(`<div class="container section">${emptyState('grid', 'Service introuvable', 'Ce service n’est plus disponible.', '<a class="btn btn-primary" href="#/services">Voir les services</a>')}</div>`, {
        active: 'services',
      });
      return;
    }
    const contact = state.user ? { name: state.user.name, email: state.user.email, phone: state.user.phone } : loadContact();
    shell(
      `
      <section class="page-hero page-hero-small">
        <div class="container">
          <a href="#/services" class="back-link">${icon('arrow-left', 16)} Tous les services</a>
          <p class="eyebrow">${esc(service.icon || '🚚')} ${esc(service.name)}</p>
          <h1>Demander une cotation</h1>
          <p class="lead">${esc(service.description)}</p>
        </div>
      </section>
      <div class="container narrow">
        <form class="card form-card" id="service-form" novalidate>
          <div class="field-grid two">
            <div class="field">
              <label for="sv-country">Pays</label>
              <select id="sv-country">${countryOptions(allCountries(), 'Cameroun')}</select>
            </div>
            <div class="field"><label for="sv-city">Ville</label><input id="sv-city" type="text" placeholder="Votre ville" /></div>
          </div>
          <div class="field">
            <label for="sv-details">Détails de votre besoin</label>
            <textarea id="sv-details" rows="5" placeholder="Décrivez votre besoin : véhicule, conteneur, documents, délais…"></textarea>
          </div>
          <div class="divider"><span>Coordonnées</span></div>
          <div class="field-grid two">
            <div class="field"><label for="sv-name">Nom complet</label><input id="sv-name" type="text" value="${esc(contact.name || '')}" placeholder="Votre nom" /></div>
            <div class="field"><label for="sv-phone">Téléphone / WhatsApp</label><input id="sv-phone" type="tel" value="${esc(contact.phone || '')}" placeholder="+237 6 00 00 00 00" /></div>
          </div>
          <div class="field"><label for="sv-email">E-mail <span class="label-optional">ou téléphone</span></label><input id="sv-email" type="email" value="${esc(contact.email || '')}" placeholder="vous@exemple.com" /></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('check', 20)} Envoyer ma demande</button>
          <p class="form-hint">${icon('lock', 14)} Aucun compte requis.</p>
        </form>
      </div>
      `,
      { active: 'services' }
    );

    document.getElementById('service-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const contactData = {
        name: document.getElementById('sv-name').value.trim(),
        phone: document.getElementById('sv-phone').value.trim(),
        email: document.getElementById('sv-email').value.trim(),
        city: document.getElementById('sv-city').value.trim(),
        country: document.getElementById('sv-country').value,
      };
      if (!contactData.name) return toast('Indiquez votre nom.', 'error');
      if (!contactData.phone && !contactData.email) return toast('Indiquez un téléphone ou un e-mail.', 'error');
      setLoading(button, true, 'Envoi…');
      try {
        const payload = {
          serviceId: service.id,
          serviceName: service.name,
          city: contactData.city,
          country: contactData.country,
          details: document.getElementById('sv-details').value.trim(),
        };
        const data = await T.api.post('/api/quotes', { type: 'service', contact: contactData, payload, distance: null });
        state.lastQuote = data.quote;
        saveContact(contactData);
        navigate('#/confirmation');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(button, false);
      }
    });
  }

  /* ----------------------------- Confirmation ---------------------------- */

  function renderConfirmation() {
    const quote = state.lastQuote;
    if (!quote) {
      navigate('#/home');
      return;
    }
    const typeMeta = QUOTE_TYPE[quote.type] || QUOTE_TYPE.service;
    const details = quoteDetailsLines(quote);
    shell(
      `
      <section class="confirmation-page">
        <div class="container narrow">
          <div class="confirm-card">
            <div class="confirm-icon">${icon('check', 38)}</div>
            <p class="eyebrow">Demande enregistrée</p>
            <h1>Merci, ${esc(quote.contact.name.split(' ')[0])} !</h1>
            <p class="lead">Votre demande de cotation a bien été envoyée. Notre équipe vous répondra par e-mail ou WhatsApp.</p>
            <div class="quote-ref">
              <span>Votre numéro de demande</span>
              <strong>${esc(quote.number)}</strong>
              <button type="button" class="link-btn" id="copy-number">${icon('copy', 14)} Copier</button>
            </div>
            <div class="confirm-summary">
              <div class="confirm-type">${icon(typeMeta.icon, 18)} ${esc(typeMeta.label)}</div>
              ${details.map((line) => `<p>${line}</p>`).join('')}
            </div>
            <div class="confirm-actions">
              <a class="btn btn-primary" href="#/home">Retour à l’accueil</a>
              ${
                state.user
                  ? '<a class="btn btn-outline" href="#/account">Suivre mes demandes</a>'
                  : '<a class="btn btn-outline" href="#/login">Créer un compte pour suivre</a>'
              }
              <a class="btn btn-ghost" href="#/roro">Nouvelle demande</a>
              ${
                quote.contact.phone
                  ? `<a class="btn btn-outline" href="https://wa.me/${encodeURIComponent(
                      String(quote.contact.phone).replace(/[^\d]/g, '')
                    )}?text=${encodeURIComponent(
                      `Bonjour, je vous confirme ma demande de cotation ${quote.number} (${typeMeta.label}).`
                    )}" target="_blank" rel="noopener">${icon('whatsapp', 18)} Confirmer sur WhatsApp</a>`
                  : ''
              }
            </div>
            <p class="confirm-note">${icon('info', 16)} Conservez ce numéro : il vous sera demandé pour toute question sur votre demande.</p>
          </div>
        </div>
      </section>
      `,
      { active: quote.type === 'roro' ? 'roro' : quote.type === 'container' ? 'containers' : 'services' }
    );
    const copyButton = document.getElementById('copy-number');
    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(quote.number);
          toast('Numéro copié.', 'success');
        } catch (err) {
          toast(quote.number, 'info');
        }
      });
    }
  }

  function quoteDetailsLines(quote) {
    const p = quote.payload || {};
    if (quote.type === 'roro') {
      const from = port(p.fromPortId);
      const to = port(p.toPortId);
      const v = p.vehicle || {};
      const lines = [];
      if (v.brand || v.model) lines.push(`<strong>Véhicule :</strong> ${esc([v.brand, v.model].filter(Boolean).join(' '))}${v.year ? ` (${esc(v.year)})` : ''}`);
      if (p.ship) lines.push(`<strong>Départ :</strong> ${esc(p.ship)}${p.departureId ? '' : ''}`);
      if (from && to) lines.push(`<strong>Trajet :</strong> ${esc(from.name)} → ${esc(to.name)}`);
      if (p.pickup && p.pickup.city) lines.push(`<strong>Prise en charge :</strong> ${esc(p.pickup.city)}, ${esc(p.pickup.country)}`);
      if (quote.distance) lines.push(`<strong>Distance jusqu’au port :</strong> ${fmtNumber(quote.distance.km, 1)} km`);
      return lines;
    }
    if (quote.type === 'container') {
      const lines = [];
      lines.push(`<strong>Conteneur :</strong> ${esc(p.quantity || 1)} × ${esc(p.containerName || '')}`);
      lines.push(`<strong>État :</strong> ${p.condition === 'neuf' ? 'Neuf' : 'Occasion'}`);
      if (p.delivery) lines.push(`<strong>Livraison :</strong> ${esc(p.delivery.city)}, ${esc(p.delivery.country)}`);
      if (p.usage) lines.push(`<strong>Usage :</strong> ${esc(p.usage)}`);
      if (p.desiredDate) lines.push(`<strong>Date souhaitée :</strong> ${fmtDate(p.desiredDate)}`);
      if (quote.distance) lines.push(`<strong>Distance jusqu’au port :</strong> ${fmtNumber(quote.distance.km, 1)} km`);
      return lines;
    }
    const lines = [];
    if (p.serviceName) lines.push(`<strong>Service :</strong> ${esc(p.serviceName)}`);
    if (p.city || p.country) lines.push(`<strong>Lieu :</strong> ${esc([p.city, p.country].filter(Boolean).join(', '))}`);
    if (p.details) lines.push(`<strong>Détails :</strong> ${esc(p.details)}`);
    return lines;
  }

  /* -------------------------------- Account ------------------------------ */

  function renderAccount() {
    if (!state.user) {
      state.loginIntent = 'account';
      navigate('#/login');
      return;
    }
    const user = state.user;
    shell(
      `
      <section class="page-hero page-hero-small">
        <div class="container">
          <p class="eyebrow">Espace client</p>
          <h1>Bonjour, ${esc(user.name.split(' ')[0])}</h1>
          <p class="lead">Retrouvez vos références enregistrées et l’historique de vos demandes.</p>
        </div>
      </section>
      <div class="container">
        <div class="account-tabs" role="tablist">
          <button class="account-tab ${state.accountTab === 'history' ? 'active' : ''}" data-account-tab="history" type="button">${icon('inbox', 18)} Historique</button>
          <button class="account-tab ${state.accountTab === 'references' ? 'active' : ''}" data-account-tab="references" type="button">${icon('box', 18)} Références</button>
          <button class="account-tab ${state.accountTab === 'profile' ? 'active' : ''}" data-account-tab="profile" type="button">${icon('user', 18)} Profil</button>
        </div>
        <div id="account-content">${loading()}</div>
      </div>
      `,
      { active: 'home' }
    );
    $$('[data-account-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.accountTab = tab.dataset.accountTab;
        renderAccount();
      });
    });
    loadAccountTab();
  }

  async function loadAccountTab() {
    const root = document.getElementById('account-content');
    if (!root) return;
    root.innerHTML = loading();
    try {
      if (state.accountTab === 'history') {
        const [quotesData, notificationsData] = await Promise.all([
          T.api.get('/api/account/quotes'),
          T.api.get('/api/account/notifications'),
        ]);
        root.innerHTML = accountHistoryHtml(quotesData.quotes, notificationsData.notifications);
        bindAccountHistory(notificationsData.notifications);
      } else if (state.accountTab === 'references') {
        await refreshUser();
        root.innerHTML = accountReferencesHtml(state.user);
        bindAccountReferences();
      } else {
        root.innerHTML = accountProfileHtml(state.user);
        bindAccountProfile();
      }
    } catch (err) {
      root.innerHTML = `<div class="panel">${emptyState('alert', 'Erreur', err.message, '<button class="btn btn-outline" onclick="location.reload()">Recharger</button>')}</div>`;
    }
  }

  function accountHistoryHtml(quotes, notifications) {
    return `
      ${
        notifications && notifications.length
          ? `<div class="panel notifications-panel">
              <div class="panel-head"><h3>${icon('bell', 18)} Notifications</h3></div>
              ${notifications
                .map(
                  (n) => `<div class="notification-row ${n.read ? '' : 'unread'}" data-notification="${esc(n.id)}">
                    <span class="notification-dot"></span>
                    <div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${fmtDateTime(n.createdAt)}</small></div>
                  </div>`
                )
                .join('')}
            </div>`
          : ''
      }
      <div class="panel">
        <div class="panel-head"><h3>${icon('inbox', 18)} Mes demandes</h3><span class="badge-soft">${quotes.length}</span></div>
        ${
          quotes.length
            ? `<div class="quote-history-list">${quotes.map(accountQuoteCard).join('')}</div>`
            : emptyState('inbox', 'Aucune demande', 'Vous n’avez pas encore envoyé de demande de cotation.', '<a class="btn btn-primary" href="#/roro">Demander une cotation</a>')
        }
      </div>`;
  }

  function accountQuoteCard(quote) {
    return `<article class="quote-history-card">
      <div class="qh-head">
        <span class="q-number">${esc(quote.number)}</span>
        ${typeBadge(quote.type)}
        ${statusPill(quote.status)}
        <span class="qh-date">${fmtDate(quote.createdAt)}</span>
      </div>
      <div class="qh-summary">${quoteDetailsLines(quote).join('')}</div>
      ${
        quote.adminResponse
          ? `<div class="qh-response">
              <span class="qh-response-label">${icon('mail', 14)} Réponse du prestataire</span>
              ${quote.adminResponse.price ? `<p class="qh-price">${esc(quote.adminResponse.price)}</p>` : ''}
              ${quote.adminResponse.message ? `<p>${esc(quote.adminResponse.message)}</p>` : ''}
              <small>${fmtDateTime(quote.adminResponse.respondedAt)}</small>
            </div>`
          : ''
      }
    </article>`;
  }

  function bindAccountHistory(notifications) {
    $$('[data-notification]').forEach((row) => {
      if (!row.classList.contains('unread')) return;
      row.addEventListener('click', async () => {
        try {
          await T.api.post(`/api/account/notifications/${row.dataset.notification}/read`, {});
          row.classList.remove('unread');
        } catch (err) {
          /* noop */
        }
      });
    });
  }

  function accountReferencesHtml(user) {
    return `
      <div class="references-grid">
        <div class="panel">
          <div class="panel-head"><h3>${icon('ship', 18)} Mes véhicules</h3><span class="badge-soft">${(user.vehicles || []).length}</span></div>
          ${
            (user.vehicles || []).length
              ? `<div class="reference-list">${(user.vehicles || [])
                  .map(
                    (v) => `<div class="reference-item">
                      <div><strong>${esc(v.brand)} ${esc(v.model)}</strong><p>${esc(v.type || '')}${v.year ? ` · ${esc(v.year)}` : ''}${v.vin ? ` · VIN ${esc(v.vin)}` : ''}</p></div>
                      <div class="reference-actions">
                        <button class="btn btn-outline btn-xs" data-use-vehicle="${esc(v.id)}">${icon('ship', 13)} Utiliser</button>
                        <button class="icon-btn btn-icon-danger" data-delete-vehicle="${esc(v.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
                      </div>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('ship', 'Aucun véhicule', 'Enregistrez un véhicule pour pré-remplir vos prochaines demandes.')
          }
          <form class="reference-form" id="vehicle-form">
            <h4>Ajouter un véhicule</h4>
            <div class="field-grid two">
              <div class="field"><label for="veh-brand">Marque</label><input id="veh-brand" type="text" placeholder="Toyota" /></div>
              <div class="field"><label for="veh-model">Modèle</label><input id="veh-model" type="text" placeholder="Hilux" /></div>
            </div>
            <div class="field-grid two">
              <div class="field"><label for="veh-type">Type</label><input id="veh-type" type="text" placeholder="Pick-up" /></div>
              <div class="field"><label for="veh-year">Année</label><input id="veh-year" type="number" placeholder="2021" /></div>
            </div>
            <div class="field"><label for="veh-vin">Châssis (VIN)</label><input id="veh-vin" type="text" placeholder="JTEAB3CD300000001" /></div>
            <button class="btn btn-primary btn-sm" type="submit">${icon('plus', 16)} Enregistrer</button>
          </form>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>${icon('container', 18)} Mes conteneurs</h3><span class="badge-soft">${(user.containers || []).length}</span></div>
          ${
            (user.containers || []).length
              ? `<div class="reference-list">${(user.containers || [])
                  .map(
                    (c) => `<div class="reference-item">
                      <div><strong>${esc(c.type)}</strong><p>${esc(c.condition || '')}${c.notes ? ` · ${esc(c.notes)}` : ''}</p></div>
                      <div class="reference-actions">
                        <button class="btn btn-outline btn-xs" data-use-container="${esc(c.id)}">${icon('container', 13)} Utiliser</button>
                        <button class="icon-btn btn-icon-danger" data-delete-container="${esc(c.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
                      </div>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('container', 'Aucun conteneur', 'Enregistrez un type de conteneur pour pré-remplir vos demandes.')
          }
          <form class="reference-form" id="container-ref-form">
            <h4>Ajouter un conteneur</h4>
            <div class="field-grid two">
              <div class="field"><label for="cref-type">Type</label><input id="cref-type" type="text" placeholder="Conteneur 40 pieds" /></div>
              <div class="field"><label for="cref-condition">État</label>
                <select id="cref-condition"><option value="neuf">Neuf</option><option value="occasion">Occasion</option></select>
              </div>
            </div>
            <div class="field"><label for="cref-notes">Notes <span class="label-optional">facultatif</span></label><input id="cref-notes" type="text" placeholder="Livraison à Douala…" /></div>
            <button class="btn btn-primary btn-sm" type="submit">${icon('plus', 16)} Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  function bindAccountReferences() {
    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) {
      vehicleForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = vehicleForm.querySelector('[type="submit"]');
        setLoading(button, true, 'Enregistrement…');
        try {
          await T.api.post('/api/account/vehicles', {
            brand: document.getElementById('veh-brand').value.trim(),
            model: document.getElementById('veh-model').value.trim(),
            type: document.getElementById('veh-type').value.trim(),
            year: document.getElementById('veh-year').value,
            vin: document.getElementById('veh-vin').value.trim(),
          });
          await refreshUser();
          toast('Véhicule enregistré.', 'success');
          loadAccountTab();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    }
    const containerForm = document.getElementById('container-ref-form');
    if (containerForm) {
      containerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = containerForm.querySelector('[type="submit"]');
        setLoading(button, true, 'Enregistrement…');
        try {
          await T.api.post('/api/account/containers', {
            type: document.getElementById('cref-type').value.trim(),
            condition: document.getElementById('cref-condition').value,
            notes: document.getElementById('cref-notes').value.trim(),
          });
          await refreshUser();
          toast('Conteneur enregistré.', 'success');
          loadAccountTab();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    }
    $$('[data-use-vehicle]').forEach((button) => {
      button.addEventListener('click', () => {
        const vehicle = (state.user.vehicles || []).find((v) => v.id === button.dataset.useVehicle);
        if (!vehicle) return;
        state.prefillVehicle = vehicle;
        toast('Référence sélectionnée. Complétez votre demande.', 'success');
        navigate('#/roro');
      });
    });
    $$('[data-use-container]').forEach((button) => {
      button.addEventListener('click', () => {
        const ref = (state.user.containers || []).find((c) => c.id === button.dataset.useContainer);
        if (!ref) return;
        state.prefillContainer = ref;
        toast('Référence sélectionnée. Complétez votre demande.', 'success');
        navigate('#/containers');
      });
    });
    $$('[data-delete-vehicle]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce véhicule ?', 'Cette référence sera retirée de votre compte.', { confirmLabel: 'Supprimer' }))) return;
        await T.api.del(`/api/account/vehicles/${button.dataset.deleteVehicle}`);
        await refreshUser();
        toast('Véhicule supprimé.', 'success');
        loadAccountTab();
      });
    });
    $$('[data-delete-container]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce conteneur ?', 'Cette référence sera retirée de votre compte.', { confirmLabel: 'Supprimer' }))) return;
        await T.api.del(`/api/account/containers/${button.dataset.deleteContainer}`);
        await refreshUser();
        toast('Conteneur supprimé.', 'success');
        loadAccountTab();
      });
    });
  }

  function accountProfileHtml(user) {
    return `
      <div class="profile-grid">
        <form class="panel form" id="profile-form">
          <div class="panel-head"><h3>${icon('user', 18)} Mes informations</h3></div>
          <div class="field"><label for="pf-name">Nom complet</label><input id="pf-name" type="text" value="${esc(user.name)}" /></div>
          <div class="field"><label for="pf-email">E-mail</label><input id="pf-email" type="email" value="${esc(user.email || '')}" /></div>
          <div class="field"><label for="pf-phone">Téléphone / WhatsApp</label><input id="pf-phone" type="tel" value="${esc(user.phone || '')}" /></div>
          <div class="field"><label for="pf-language">Langue</label>
            <select id="pf-language">
              <option value="fr" ${user.language === 'fr' ? 'selected' : ''}>Français</option>
              <option value="en" ${user.language === 'en' ? 'selected' : ''}>Anglais (bientôt disponible)</option>
            </select>
          </div>
          <button class="btn btn-primary" type="submit">${icon('save', 18)} Enregistrer</button>
        </form>
        <form class="panel form" id="password-form">
          <div class="panel-head"><h3>${icon('lock', 18)} Mot de passe</h3></div>
          <div class="field"><label for="pw-current">Mot de passe actuel</label><input id="pw-current" type="password" autocomplete="current-password" /></div>
          <div class="field"><label for="pw-next">Nouveau mot de passe</label><input id="pw-next" type="password" autocomplete="new-password" /></div>
          <button class="btn btn-outline" type="submit">${icon('key', 18)} Modifier le mot de passe</button>
        </form>
        <div class="panel">
          <div class="panel-head"><h3>${icon('logout', 18)} Session</h3></div>
          <p class="muted">Vous êtes connecté en tant que ${esc(user.name)}.</p>
          <button class="btn btn-danger-ghost" id="btn-logout" type="button">${icon('logout', 18)} Se déconnecter</button>
        </div>
      </div>`;
  }

  function bindAccountProfile() {
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = profileForm.querySelector('[type="submit"]');
        setLoading(button, true, 'Enregistrement…');
        try {
          const data = await T.api.put('/api/account/profile', {
            name: document.getElementById('pf-name').value.trim(),
            email: document.getElementById('pf-email').value.trim(),
            phone: document.getElementById('pf-phone').value.trim(),
            language: document.getElementById('pf-language').value,
          });
          state.user = data.user;
          toast('Profil mis à jour.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    }
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = passwordForm.querySelector('[type="submit"]');
        setLoading(button, true, 'Modification…');
        try {
          const data = await T.api.put('/api/account/password', {
            current: document.getElementById('pw-current').value,
            next: document.getElementById('pw-next').value,
          });
          toast(data.message, 'success');
          passwordForm.reset();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(button, false);
        }
      });
    }
    const logout = document.getElementById('btn-logout');
    if (logout) {
      logout.addEventListener('click', async () => {
        try {
          await T.api.post('/api/auth/logout', {});
        } catch (err) {
          /* la session locale est nettoyée quand même */
        }
        state.user = null;
        state.visitor = false;
        storageRemove('transit_visitor');
        toast('Vous êtes déconnecté.', 'success');
        navigate('#/login');
      });
    }
  }

  /* -------------------------------- Admin -------------------------------- */

  const ADMIN_SECTIONS = [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
    { id: 'quotes', label: 'Cotations', icon: 'inbox' },
    { id: 'departures', label: 'Départs', icon: 'ship' },
    { id: 'ports', label: 'Ports', icon: 'pin' },
    { id: 'containers', label: 'Conteneurs', icon: 'container' },
    { id: 'slider', label: 'Slider', icon: 'image' },
    { id: 'services', label: 'Services', icon: 'grid' },
    { id: 'users', label: 'Utilisateurs', icon: 'user' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
  ];

  function renderAdmin(section) {
    state.adminSection = ADMIN_SECTIONS.some((s) => s.id === section) ? section : 'dashboard';
    const current = ADMIN_SECTIONS.find((s) => s.id === state.adminSection);
    document.getElementById('app').innerHTML = `
      <div class="admin-shell">
        <aside class="admin-sidebar">
          <a class="brand" href="#/home">
            <span class="brand-mark">${icon('ship', 22)}</span>
            <span class="brand-name">TRANSIT<small>Espace administrateur</small></span>
          </a>
          <nav class="admin-nav" aria-label="Administration">
            ${ADMIN_SECTIONS.map(
              (item) => `<a href="#/admin/${item.id}" class="admin-nav-item ${item.id === state.adminSection ? 'active' : ''}" ${item.id === state.adminSection ? 'aria-current="page"' : ''}>
                ${icon(item.icon, 19)}<span>${item.label}</span>
                ${item.id === 'quotes' ? '<b class="nav-badge hidden" data-nav-badge></b>' : ''}
              </a>`
            ).join('')}
          </nav>
          <div class="admin-sidebar-foot">
            <a class="admin-back" href="#/home">${icon('arrow-left', 16)} Retour au site</a>
            <button class="btn btn-ghost btn-sm" id="admin-logout" type="button">${icon('logout', 16)} Déconnexion</button>
          </div>
        </aside>
        <main class="admin-main">
          <header class="admin-topbar">
            <span class="admin-page-title">${icon(current.icon, 20)} ${esc(current.label)}</span>
            <div class="admin-top-actions">
              <a class="topbar-link" href="#/home">${icon('external', 16)}<span>Voir le site</span></a>
              <a class="user-chip" href="#/account"><span class="avatar">${esc(initials(state.user.name))}</span><span class="user-chip-name">${esc(state.user.name.split(' ')[0])}</span></a>
            </div>
          </header>
          <div id="admin-content" class="admin-content">${loading()}</div>
        </main>
      </div>`;
    document.getElementById('admin-logout').addEventListener('click', async () => {
      try {
        await T.api.post('/api/auth/logout', {});
      } catch (err) {
        /* la session locale est nettoyée quand même */
      }
      state.user = null;
      toast('Déconnecté.', 'success');
      navigate('#/login');
    });
    updateAdminBadge();
    loadAdminSection();
  }

  async function updateAdminBadge() {
    try {
      const data = await T.api.get('/api/admin/notifications');
      state.adminUnread = data.unread;
      $$('[data-nav-badge]').forEach((badge) => {
        badge.textContent = String(data.unread);
        badge.classList.toggle('hidden', !data.unread);
      });
    } catch (err) {
      /* noop */
    }
  }

  async function loadAdminSection() {
    const root = document.getElementById('admin-content');
    if (!root) return;
    root.innerHTML = loading();
    try {
      if (state.adminSection === 'dashboard') {
        const data = await T.api.get('/api/admin/stats');
        root.innerHTML = adminDashboardHtml(data);
        bindAdminDashboard();
      } else if (state.adminSection === 'quotes') {
        const filters = state.adminFilters;
        const query = new URLSearchParams();
        if (filters.type) query.set('type', filters.type);
        if (filters.status) query.set('status', filters.status);
        if (filters.q) query.set('q', filters.q);
        if (filters.from) query.set('from', filters.from);
        if (filters.to) query.set('to', filters.to);
        const data = await T.api.get(`/api/admin/quotes?${query.toString()}`);
        root.innerHTML = adminQuotesHtml(data.quotes);
        bindAdminQuotes();
        if (state.adminRestoreSearch) {
          const search = document.getElementById('f-q');
          if (search) {
            search.focus();
            const position = state.adminRestoreSearch.position;
            if (typeof position === 'number') search.setSelectionRange(position, position);
          }
          state.adminRestoreSearch = null;
        }
      } else if (state.adminSection === 'departures') {
        const data = await T.api.get('/api/admin/departures');
        root.innerHTML = adminDeparturesHtml(data.departures);
        bindAdminDepartures();
      } else if (state.adminSection === 'ports') {
        const data = await T.api.get('/api/admin/ports');
        root.innerHTML = adminPortsHtml(data.ports);
        bindAdminPorts();
      } else if (state.adminSection === 'containers') {
        const data = await T.api.get('/api/admin/containers');
        state.adminData = { ...(state.adminData || {}), containers: data.containers };
        root.innerHTML = adminContainersHtml(data.containers);
        bindAdminContainers();
      } else if (state.adminSection === 'slider') {
        const data = await T.api.get('/api/admin/sliders');
        state.adminData = { ...(state.adminData || {}), sliders: data.sliders };
        root.innerHTML = adminSlidersHtml(data.sliders);
        bindAdminSliders();
      } else if (state.adminSection === 'services') {
        const data = await T.api.get('/api/admin/services');
        state.adminData = { ...(state.adminData || {}), services: data.services };
        root.innerHTML = adminServicesHtml(data.services);
        bindAdminServices();
      } else if (state.adminSection === 'users') {
        const data = await T.api.get('/api/admin/users');
        root.innerHTML = adminUsersHtml(data.users);
        bindAdminUsers();
      } else if (state.adminSection === 'notifications') {
        const data = await T.api.get('/api/admin/notifications');
        root.innerHTML = adminNotificationsHtml(data.notifications);
        bindAdminNotifications();
      }
    } catch (err) {
      root.innerHTML = `<div class="panel">${emptyState('alert', 'Erreur', err.message, '<button class="btn btn-outline" onclick="location.reload()">Recharger</button>')}</div>`;
    }
  }

  function adminDashboardHtml(data) {
    const { stats, recentQuotes, upcomingDepartures } = data;
    return `
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-icon stat-blue">${icon('inbox', 22)}</span>
          <div><strong>${stats.quotes.total}</strong><span>Demandes</span></div>
          <small>${stats.quotes.today} aujourd’hui</small>
        </div>
        <div class="stat-card">
          <span class="stat-icon stat-amber">${icon('clock', 22)}</span>
          <div><strong>${stats.quotes.received}</strong><span>À traiter</span></div>
          <small>${stats.quotes.processing} en cours</small>
        </div>
        <div class="stat-card">
          <span class="stat-icon stat-teal">${icon('ship', 22)}</span>
          <div><strong>${stats.departures.upcoming}</strong><span>Départs à venir</span></div>
          <small>${stats.departures.total} au total</small>
        </div>
        <div class="stat-card">
          <span class="stat-icon stat-violet">${icon('user', 22)}</span>
          <div><strong>${stats.users.clients}</strong><span>Clients</span></div>
          <small>${stats.containers} conteneurs</small>
        </div>
      </div>
      <div class="admin-grid">
        <section class="panel">
          <div class="panel-head">
            <h3>${icon('inbox', 18)} Demandes récentes</h3>
            <a class="link-arrow" href="#/admin/quotes">Tout voir ${icon('arrow-right', 14)}</a>
          </div>
          ${recentQuotes.length ? `<div class="mini-quote-list">${recentQuotes.map(adminMiniQuote).join('')}</div>` : emptyState('inbox', 'Aucune demande', 'Les nouvelles demandes apparaîtront ici.')}
        </section>
        <section class="panel">
          <div class="panel-head"><h3>${icon('ship', 18)} Départs à venir</h3><a class="link-arrow" href="#/admin/departures">Gérer ${icon('arrow-right', 14)}</a></div>
          ${
            upcomingDepartures.length
              ? `<div class="mini-list">${upcomingDepartures
                  .map(
                    (d) => `<div class="mini-row"><div><strong>${esc(d.ship)}</strong><p>${esc(port(d.fromPortId) ? port(d.fromPortId).city : '')} → ${esc(port(d.toPortId) ? port(d.toPortId).city : '')}</p></div><span class="mini-date">${fmtDate(d.departureDate)}</span></div>`
                  )
                  .join('')}</div>`
              : emptyState('ship', 'Aucun départ', 'Créez un départ Ro-Ro.', '<a class="btn btn-primary btn-sm" href="#/admin/departures">Ajouter</a>')
          }
        </section>
      </div>`;
  }

  function bindAdminDashboard() {
    $$('[data-quote-id]').forEach((row) => {
      row.addEventListener('click', () => openQuoteModalById(row.dataset.quoteId));
    });
  }

  function adminMiniQuote(quote) {
    return `<button class="mini-quote" type="button" data-quote-id="${esc(quote.id)}">
      <span class="q-number">${esc(quote.number)}</span>
      <div><strong>${esc(quote.contact.name)}</strong><p>${esc(quoteSummaryText(quote))}</p></div>
      ${statusPill(quote.status)}
    </button>`;
  }

  function quoteSummaryText(quote) {
    const p = quote.payload || {};
    if (quote.type === 'roro') {
      const from = port(p.fromPortId);
      const to = port(p.toPortId);
      const v = p.vehicle || {};
      return `${[v.brand, v.model].filter(Boolean).join(' ') || 'Véhicule'} · ${from ? from.city : ''} → ${to ? to.city : ''}${quote.distance ? ` · ${fmtNumber(quote.distance.km, 0)} km` : ''}`;
    }
    if (quote.type === 'container') {
      return `${p.quantity || 1} × ${p.containerName || ''} · ${p.delivery ? p.delivery.city : ''}`;
    }
    return `${p.serviceName || 'Service'}${p.city ? ` · ${p.city}` : ''}`;
  }

  function adminQuotesHtml(quotes) {
    const f = state.adminFilters;
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Cotations</h2><p>${quotes.length} demande(s) trouvée(s)</p></div>
      </div>
      <div class="filters">
        <select id="f-type">
          <option value="">Tous les onglets</option>
          ${['roro', 'container', 'service'].map((type) => option(type, QUOTE_TYPE[type].label, f.type)).join('')}
        </select>
        <select id="f-status">
          <option value="">Tous les statuts</option>
          ${Object.entries(QUOTE_STATUS).map(([value, meta]) => option(value, meta.label, f.status)).join('')}
        </select>
        <input id="f-q" type="search" placeholder="N°, nom, e-mail, téléphone…" value="${esc(f.q)}" />
        <input id="f-from" type="date" value="${esc(f.from)}" title="Du" />
        <input id="f-to" type="date" value="${esc(f.to)}" title="Au" />
        <button class="btn btn-ghost btn-sm" id="f-reset" type="button">${icon('refresh', 15)} Réinitialiser</button>
      </div>
      ${
        quotes.length
          ? `<div class="quote-admin-list">${quotes.map(adminQuoteRow).join('')}</div>`
          : emptyState('inbox', 'Aucune demande', 'Aucune demande ne correspond à ces filtres.')
      }
    </div>`;
  }

  function adminQuoteRow(quote) {
    return `<button class="quote-admin-row" type="button" data-quote-id="${esc(quote.id)}">
      <div class="qa-top">
        <span class="q-number">${esc(quote.number)}</span>
        ${typeBadge(quote.type)}
        ${statusPill(quote.status)}
        <span class="qa-date">${fmtDateTime(quote.createdAt)}</span>
      </div>
      <div class="qa-main">
        <div class="qa-contact"><strong>${esc(quote.contact.name)}</strong><span>${esc(quote.contact.email || quote.contact.phone)}</span></div>
        <div class="qa-summary">${esc(quoteSummaryText(quote))}</div>
      </div>
    </button>`;
  }

  function bindAdminQuotes() {
    const typeSelect = document.getElementById('f-type');
    const statusSelect = document.getElementById('f-status');
    const search = document.getElementById('f-q');
    const from = document.getElementById('f-from');
    const to = document.getElementById('f-to');
    const apply = () => {
      state.adminFilters = {
        type: typeSelect.value,
        status: statusSelect.value,
        q: search.value.trim(),
        from: from.value,
        to: to.value,
      };
      loadAdminSection();
    };
    typeSelect.addEventListener('change', apply);
    statusSelect.addEventListener('change', apply);
    from.addEventListener('change', apply);
    to.addEventListener('change', apply);
    search.addEventListener(
      'input',
      debounce(() => {
        state.adminFilters.q = search.value.trim();
        state.adminRestoreSearch = { position: search.selectionStart };
        loadAdminSection();
      }, 450)
    );
    document.getElementById('f-reset').addEventListener('click', () => {
      state.adminFilters = { type: '', status: '', q: '', from: '', to: '' };
      loadAdminSection();
    });
    $$('[data-quote-id]').forEach((row) => {
      row.addEventListener('click', () => openQuoteModalById(row.dataset.quoteId));
    });
  }

  async function openQuoteModalById(id) {
    try {
      const data = await T.api.get(`/api/quotes/${id}`);
      openQuoteModal(data.quote);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function quoteDetailFields(quote) {
    const p = quote.payload || {};
    if (quote.type === 'roro') {
      const from = port(p.fromPortId);
      const to = port(p.toPortId);
      const v = p.vehicle || {};
      return `<dl class="detail-list">
        <div><dt>Navire</dt><dd>${esc(p.ship || '—')}</dd></div>
        <div><dt>Trajet</dt><dd>${esc(from ? from.name : '—')} → ${esc(to ? to.name : '—')}</dd></div>
        <div><dt>Véhicule</dt><dd>${esc([v.brand, v.model].filter(Boolean).join(' ') || '—')}${v.year ? ` · ${esc(v.year)}` : ''}</dd></div>
        <div><dt>Type</dt><dd>${esc(v.type || '—')}</dd></div>
        <div><dt>Châssis</dt><dd>${esc(v.vin || '—')}</dd></div>
        <div><dt>Prise en charge</dt><dd>${esc(p.pickup ? `${p.pickup.city}, ${p.pickup.country}` : '—')}</dd></div>
      </dl>`;
    }
    if (quote.type === 'container') {
      return `<dl class="detail-list">
        <div><dt>Conteneur</dt><dd>${esc(p.containerName || '—')}</dd></div>
        <div><dt>Quantité</dt><dd>${esc(p.quantity || 1)}</dd></div>
        <div><dt>État</dt><dd>${p.condition === 'neuf' ? 'Neuf' : 'Occasion'}</dd></div>
        <div><dt>Livraison</dt><dd>${esc(p.delivery ? `${p.delivery.city}, ${p.delivery.country}` : '—')}</dd></div>
        <div><dt>Usage</dt><dd>${esc(p.usage || '—')}</dd></div>
        <div><dt>Date souhaitée</dt><dd>${fmtDate(p.desiredDate)}</dd></div>
      </dl>`;
    }
    return `<dl class="detail-list">
      <div><dt>Service</dt><dd>${esc(p.serviceName || '—')}</dd></div>
      <div><dt>Lieu</dt><dd>${esc([p.city, p.country].filter(Boolean).join(', ') || '—')}</dd></div>
      <div><dt>Détails</dt><dd>${esc(p.details || '—')}</dd></div>
    </dl>`;
  }

  function openQuoteModal(quote) {
    const body = `<div class="quote-detail">
      <div class="qd-head">
        <span class="q-number">${esc(quote.number)}</span>
        ${typeBadge(quote.type)}
        ${statusPill(quote.status)}
        <span class="qa-date">${fmtDateTime(quote.createdAt)}</span>
      </div>
      <div class="qd-grid">
        <div class="qd-block">
          <h4>Client</h4>
          <dl class="detail-list">
            <div><dt>Nom</dt><dd>${esc(quote.contact.name)}</dd></div>
            <div><dt>Téléphone</dt><dd>${esc(quote.contact.phone || '—')}</dd></div>
            <div><dt>E-mail</dt><dd>${esc(quote.contact.email || '—')}</dd></div>
            <div><dt>Ville</dt><dd>${esc(quote.contact.city || '—')}${quote.contact.country ? `, ${esc(quote.contact.country)}` : ''}</dd></div>
            ${
              quote.contact.phone
                ? `<div><dt>WhatsApp</dt><dd><a href="https://wa.me/${encodeURIComponent(
                    String(quote.contact.phone).replace(/[^\d]/g, '')
                  )}" target="_blank" rel="noopener">${icon('whatsapp', 14)} Écrire</a></dd></div>`
                : ''
            }
          </dl>
        </div>
        <div class="qd-block">
          <h4>Demande</h4>
          ${quoteDetailFields(quote)}
        </div>
        ${
          quote.distance
            ? `<div class="qd-block">
                <h4>Distance</h4>
                <p class="distance-inline"><strong>${fmtNumber(quote.distance.km, 1)} km</strong> · ${quote.distance.mode === 'road' ? 'itinéraire routier' : 'à vol d’oiseau'}</p>
                <p class="muted">${esc(quote.distance.from ? quote.distance.from.name : '')} → ${esc(quote.distance.to ? quote.distance.to.name : '')}</p>
              </div>`
            : ''
        }
      </div>
      <form class="respond-form" id="respond-form">
        <h4>${icon('mail', 18)} Réponse au client</h4>
        <div class="field"><label for="rsp-price">Prix proposé</label><input id="rsp-price" name="price" value="${esc((quote.adminResponse && quote.adminResponse.price) || '')}" placeholder="Ex. 2 500 000 FCFA" /></div>
        <div class="field"><label for="rsp-message">Message</label><textarea id="rsp-message" name="message" rows="4" placeholder="Détails de la cotation, conditions, délais…">${esc((quote.adminResponse && quote.adminResponse.message) || '')}</textarea></div>
        <div class="respond-actions">
          <select name="status" aria-label="Statut">
            ${Object.entries(QUOTE_STATUS).map(([value, meta]) => option(value, meta.label, quote.status)).join('')}
          </select>
          <button class="btn btn-primary" type="submit">${icon('send', 18)} Envoyer la réponse</button>
        </div>
      </form>
    </div>`;
    modal({
      title: 'Détail de la demande',
      body,
      wide: true,
      onOpen: (modalEl) => {
        modalEl.querySelector('#respond-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const button = form.querySelector('[type="submit"]');
          setLoading(button, true, 'Envoi…');
          try {
            const fields = form.elements;
            await T.api.post(`/api/quotes/${quote.id}/respond`, {
              price: fields.namedItem('price').value,
              message: fields.namedItem('message').value,
              status: fields.namedItem('status').value,
            });
            closeModal();
            toast('Réponse envoyée au client.', 'success');
            loadAdminSection();
            updateAdminBadge();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminDeparturesHtml(departures) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Départs Ro-Ro</h2><p>${departures.length} départ(s) enregistré(s)</p></div>
        <button class="btn btn-primary btn-sm" id="add-departure" type="button">${icon('plus', 16)} Nouveau départ</button>
      </div>
      ${
        departures.length
          ? `<div class="table-wrap"><table class="data-table">
              <thead><tr><th>Navire</th><th>Trajet</th><th>Départ</th><th>Dépôt</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                ${departures
                  .map(
                    (d) => `<tr>
                      <td><strong>${esc(d.ship)}</strong>${d.note ? `<small>${esc(d.note)}</small>` : ''}</td>
                      <td>${esc(port(d.fromPortId) ? port(d.fromPortId).city : '—')} → ${esc(port(d.toPortId) ? port(d.toPortId).city : '—')}</td>
                      <td>${fmtDate(d.departureDate)}</td>
                      <td>${fmtDate(d.depositDeadline)}</td>
                      <td>${departurePill(d.status)}</td>
                      <td><div class="row-actions">
                        <button class="icon-btn" data-edit-departure="${esc(d.id)}" aria-label="Modifier">${icon('edit', 16)}</button>
                        <button class="icon-btn btn-icon-danger" data-delete-departure="${esc(d.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
                      </div></td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table></div>`
          : emptyState('ship', 'Aucun départ', 'Créez un premier départ Ro-Ro.')
      }
    </div>`;
  }

  function bindAdminDepartures() {
    document.getElementById('add-departure').addEventListener('click', () => departureForm(null));
    $$('[data-edit-departure]').forEach((btn) => {
      btn.addEventListener('click', () => openDepartureForm(btn.dataset.editDeparture));
    });
    $$('[data-delete-departure]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce départ ?', 'Cette action est définitive.', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/departures/${btn.dataset.deleteDeparture}`);
          toast('Départ supprimé.', 'success');
          await refreshContent();
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function openDepartureForm(id) {
    let departure = null;
    if (id) {
      try {
        const data = await T.api.get('/api/admin/departures');
        departure = data.departures.find((d) => d.id === id);
      } catch (err) {
        toast(err.message, 'error');
        return;
      }
    }
    departureForm(departure);
  }

  function departureForm(departure) {
    const ports = state.content.ports;
    const body = `<form id="departure-form" class="form">
      <div class="field"><label for="dep-ship">Nom du navire</label><input id="dep-ship" required value="${esc(departure ? departure.ship : '')}" placeholder="MV Atlantic Star" /></div>
      <div class="field-grid two">
        <div class="field"><label for="dep-from">Port de chargement</label>
          <select id="dep-from">${ports.filter((p) => p.role !== 'discharge').map((p) => option(p.id, `${p.name} (${p.country})`, departure ? departure.fromPortId : '')).join('')}</select>
        </div>
        <div class="field"><label for="dep-to">Port de déchargement</label>
          <select id="dep-to">${ports.filter((p) => p.role !== 'loading').map((p) => option(p.id, `${p.name} (${p.country})`, departure ? departure.toPortId : '')).join('')}</select>
        </div>
      </div>
      <div class="field-grid two">
        <div class="field"><label for="dep-date">Date de départ</label><input id="dep-date" type="date" required value="${esc(departure ? departure.departureDate : '')}" /></div>
        <div class="field"><label for="dep-deposit">Date limite de dépôt</label><input id="dep-deposit" type="date" required value="${esc(departure ? departure.depositDeadline : '')}" /></div>
      </div>
      <div class="field-grid two">
        <div class="field"><label for="dep-status">Statut</label>
          <select id="dep-status">${Object.entries(DEPARTURE_STATUS).map(([value, meta]) => option(value, meta.label, departure ? departure.status : 'open')).join('')}</select>
        </div>
        <div class="field"><label for="dep-note">Note <span class="label-optional">facultatif</span></label><input id="dep-note" value="${esc(departure ? departure.note : '')}" placeholder="Véhicules et engins" /></div>
      </div>
    </form>`;
    modal({
      title: departure ? 'Modifier le départ' : 'Nouveau départ Ro-Ro',
      body,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Annuler</button><button class="btn btn-primary" type="button" data-save>${icon('save', 17)} Enregistrer</button>`,
      onOpen: (modalEl, close) => {
        modalEl.querySelector('[data-cancel]').addEventListener('click', close);
        modalEl.querySelector('[data-save]').addEventListener('click', async () => {
          const payload = {
            ship: document.getElementById('dep-ship').value.trim(),
            fromPortId: document.getElementById('dep-from').value,
            toPortId: document.getElementById('dep-to').value,
            departureDate: document.getElementById('dep-date').value,
            depositDeadline: document.getElementById('dep-deposit').value,
            status: document.getElementById('dep-status').value,
            note: document.getElementById('dep-note').value.trim(),
          };
          const button = modalEl.querySelector('[data-save]');
          setLoading(button, true, 'Enregistrement…');
          try {
            if (departure) await T.api.put(`/api/admin/departures/${departure.id}`, payload);
            else await T.api.post('/api/admin/departures', payload);
            close();
            toast('Départ enregistré.', 'success');
            await refreshContent();
            loadAdminSection();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminPortsHtml(ports) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Ports</h2><p>${ports.length} port(s) — coordonnées GPS exactes</p></div>
        <button class="btn btn-primary btn-sm" id="add-port" type="button">${icon('plus', 16)} Nouveau port</button>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Port</th><th>Pays</th><th>Rôle</th><th>Coordonnées</th><th></th></tr></thead>
        <tbody>
          ${ports
            .map(
              (p) => `<tr>
                <td><strong>${esc(p.name)}</strong><small>${esc(p.city || '')}</small></td>
                <td>${flag(p.countryCode)} ${esc(p.country)}</td>
                <td><span class="role-badge role-${esc(p.role)}">${p.role === 'loading' ? 'Chargement' : p.role === 'discharge' ? 'Déchargement' : 'Les deux'}</span></td>
                <td><code>${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}</code></td>
                <td><div class="row-actions">
                  <button class="icon-btn" data-edit-port="${esc(p.id)}" aria-label="Modifier">${icon('edit', 16)}</button>
                  <button class="icon-btn btn-icon-danger" data-delete-port="${esc(p.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
                </div></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function bindAdminPorts() {
    document.getElementById('add-port').addEventListener('click', () => portForm(null));
    $$('[data-edit-port]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = state.content.ports.find((x) => x.id === btn.dataset.editPort);
        portForm(p);
      });
    });
    $$('[data-delete-port]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce port ?', 'Les départs utilisant ce port devront être modifiés.', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/ports/${btn.dataset.deletePort}`);
          toast('Port supprimé.', 'success');
          await refreshContent();
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function portForm(portItem) {
    const body = `<form id="port-form" class="form">
      <div class="field"><label for="pt-name">Nom du port</label><input id="pt-name" required value="${esc(portItem ? portItem.name : '')}" placeholder="Port de Douala" /></div>
      <div class="field-grid two">
        <div class="field"><label for="pt-city">Ville</label><input id="pt-city" value="${esc(portItem ? portItem.city : '')}" placeholder="Douala" /></div>
        <div class="field"><label for="pt-country">Pays</label><input id="pt-country" required value="${esc(portItem ? portItem.country : '')}" placeholder="Cameroun" /></div>
      </div>
      <div class="field-grid two">
        <div class="field"><label for="pt-code">Code pays</label><input id="pt-code" maxlength="2" value="${esc(portItem ? portItem.countryCode : '')}" placeholder="CM" /></div>
        <div class="field"><label for="pt-role">Rôle</label>
          <select id="pt-role">
            ${[['loading', 'Chargement'], ['discharge', 'Déchargement'], ['both', 'Les deux']].map(([value, label]) => option(value, label, portItem ? portItem.role : 'both')).join('')}
          </select>
        </div>
      </div>
      <div class="field-grid two">
        <div class="field"><label for="pt-lat">Latitude</label><input id="pt-lat" type="number" step="any" required value="${portItem ? Number(portItem.lat) : ''}" placeholder="4.0443" /></div>
        <div class="field"><label for="pt-lng">Longitude</label><input id="pt-lng" type="number" step="any" required value="${portItem ? Number(portItem.lng) : ''}" placeholder="9.7005" /></div>
      </div>
      <button class="btn btn-outline btn-sm" type="button" id="pt-locate">${icon('navigation', 15)} Utiliser ma position</button>
    </form>`;
    modal({
      title: portItem ? 'Modifier le port' : 'Nouveau port',
      body,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Annuler</button><button class="btn btn-primary" type="button" data-save>${icon('save', 17)} Enregistrer</button>`,
      onOpen: (modalEl, close) => {
        modalEl.querySelector('[data-cancel]').addEventListener('click', close);
        modalEl.querySelector('#pt-locate').addEventListener('click', () => {
          if (!navigator.geolocation) return toast('Géolocalisation indisponible.', 'error');
          navigator.geolocation.getCurrentPosition((position) => {
            modalEl.querySelector('#pt-lat').value = position.coords.latitude.toFixed(6);
            modalEl.querySelector('#pt-lng').value = position.coords.longitude.toFixed(6);
            toast('Coordonnées remplies.', 'success');
          }, () => toast('Impossible de récupérer votre position.', 'error'));
        });
        modalEl.querySelector('[data-save]').addEventListener('click', async () => {
          const payload = {
            name: document.getElementById('pt-name').value.trim(),
            city: document.getElementById('pt-city').value.trim(),
            country: document.getElementById('pt-country').value.trim(),
            countryCode: document.getElementById('pt-code').value.trim().toUpperCase(),
            role: document.getElementById('pt-role').value,
            lat: document.getElementById('pt-lat').value,
            lng: document.getElementById('pt-lng').value,
          };
          const button = modalEl.querySelector('[data-save]');
          setLoading(button, true, 'Enregistrement…');
          try {
            if (portItem) await T.api.put(`/api/admin/ports/${portItem.id}`, payload);
            else await T.api.post('/api/admin/ports', payload);
            close();
            toast('Port enregistré.', 'success');
            await refreshContent();
            loadAdminSection();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminContainersHtml(containers) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Conteneurs</h2><p>${containers.length} type(s) au catalogue</p></div>
        <button class="btn btn-primary btn-sm" id="add-container" type="button">${icon('plus', 16)} Nouveau type</button>
      </div>
      <div class="admin-container-grid">
        ${containers
          .map(
            (c) => `<div class="admin-container-card">
              <div class="admin-container-img"><img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" /></div>
              <div class="admin-container-body">
                <div class="admin-container-title"><h3>${esc(c.name)}</h3>${c.active ? '<span class="status-pill status-open"><span class="dot"></span>Actif</span>' : '<span class="status-pill status-departed"><span class="dot"></span>Inactif</span>'}</div>
                <p>${esc(c.description)}</p>
                <dl class="specs">
                  <div><dt>Dimensions</dt><dd>${esc(c.dimensions)}</dd></div>
                  <div><dt>Volume</dt><dd>${esc(c.volume)}</dd></div>
                </dl>
                <div class="row-actions">
                  <button class="btn btn-outline btn-xs" data-edit-container="${esc(c.id)}">${icon('edit', 14)} Modifier</button>
                  <button class="icon-btn btn-icon-danger" data-delete-container="${esc(c.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
                </div>
              </div>
            </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function bindAdminContainers() {
    document.getElementById('add-container').addEventListener('click', () => containerForm(null));
    $$('[data-edit-container]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pool = (state.adminData && state.adminData.containers) || state.content.containers;
        const container = pool.find((c) => c.id === btn.dataset.editContainer);
        containerForm(container);
      });
    });
    $$('[data-delete-container]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce type de conteneur ?', 'Il disparaîtra du catalogue public.', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/containers/${btn.dataset.deleteContainer}`);
          toast('Conteneur supprimé.', 'success');
          await refreshContent();
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function compressImage(file, maxWidth = 1600, maxHeight = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          let { width, height } = image;
          const ratio = Math.min(1, maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image illisible'));
      };
      image.src = url;
    });
  }

  async function uploadImage(file) {
    let dataUrl;
    try {
      dataUrl = await compressImage(file);
    } catch (err) {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    const data = await T.api.post('/api/admin/upload', { dataUrl });
    return data.url;
  }

  function containerForm(container) {
    const body = `<form id="container-form" class="form">
      <div class="field"><label for="ctf-name">Nom</label><input id="ctf-name" required value="${esc(container ? container.name : '')}" placeholder="Conteneur 20 pieds" /></div>
      <div class="field-grid two">
        <div class="field"><label for="ctf-short">Nom court</label><input id="ctf-short" value="${esc(container ? container.shortName : '')}" placeholder="20 ft" /></div>
        <div class="field"><label for="ctf-volume">Volume</label><input id="ctf-volume" value="${esc(container ? container.volume : '')}" placeholder="33,2 m³" /></div>
      </div>
      <div class="field"><label for="ctf-dimensions">Dimensions</label><input id="ctf-dimensions" value="${esc(container ? container.dimensions : '')}" placeholder="6,06 × 2,44 × 2,59 m" /></div>
      <div class="field"><label for="ctf-description">Description</label><textarea id="ctf-description" rows="3">${esc(container ? container.description : '')}</textarea></div>
      <div class="field"><label for="ctf-image">Photo</label>
        <div class="upload-row">
          <input id="ctf-image" type="text" value="${esc(container ? container.image : '')}" placeholder="/img/containers/20ft.jpg" />
          <label class="btn btn-outline btn-sm upload-btn" for="ctf-file">${icon('upload', 15)} Importer</label>
          <input id="ctf-file" type="file" accept="image/*" hidden />
        </div>
        <img id="ctf-preview" class="img-preview ${container && container.image ? '' : 'hidden'}" src="${esc(container ? container.image : '')}" alt="" />
      </div>
    </form>`;
    modal({
      title: container ? 'Modifier le conteneur' : 'Nouveau type de conteneur',
      body,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Annuler</button><button class="btn btn-primary" type="button" data-save>${icon('save', 17)} Enregistrer</button>`,
      onOpen: (modalEl, close) => {
        modalEl.querySelector('[data-cancel]').addEventListener('click', close);
        const fileInput = modalEl.querySelector('#ctf-file');
        const imageInput = modalEl.querySelector('#ctf-image');
        const preview = modalEl.querySelector('#ctf-preview');
        fileInput.addEventListener('change', () => {
          const file = fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            preview.src = reader.result;
            preview.classList.remove('hidden');
          };
          reader.readAsDataURL(file);
        });
        modalEl.querySelector('[data-save]').addEventListener('click', async () => {
          const button = modalEl.querySelector('[data-save]');
          setLoading(button, true, 'Enregistrement…');
          try {
            let image = imageInput.value.trim();
            if (fileInput.files[0]) image = await uploadImage(fileInput.files[0]);
            const payload = {
              name: document.getElementById('ctf-name').value.trim(),
              shortName: document.getElementById('ctf-short').value.trim(),
              volume: document.getElementById('ctf-volume').value.trim(),
              dimensions: document.getElementById('ctf-dimensions').value.trim(),
              description: document.getElementById('ctf-description').value.trim(),
              image: image || '/img/containers/20ft.jpg',
              active: true,
            };
            if (container) await T.api.put(`/api/admin/containers/${container.id}`, payload);
            else await T.api.post('/api/admin/containers', payload);
            close();
            toast('Conteneur enregistré.', 'success');
            await refreshContent();
            loadAdminSection();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminSlidersHtml(sliders) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Slider d’accueil</h2><p>${sliders.length} image(s) — entre 5 et 6 images, défilement toutes les 5 secondes.</p></div>
        <button class="btn btn-primary btn-sm" id="add-slider" type="button" ${sliders.length >= 6 ? 'disabled' : ''}>${icon('plus', 16)} Ajouter une image</button>
      </div>
      <div class="slider-admin-list">
        ${sliders
          .map(
            (slider, index) => `<div class="slider-admin-item">
              <img src="${esc(slider.src)}" alt="${esc(slider.caption)}" />
              <div class="slider-admin-text"><strong>${esc(slider.caption || 'Sans légende')}</strong><p>${esc(slider.sub || '')}</p><small>Position ${index + 1}</small></div>
              <div class="slider-admin-actions">
                <button class="icon-btn" data-slider-up="${esc(slider.id)}" aria-label="Monter" ${index === 0 ? 'disabled' : ''}>${icon('chevron-up', 18)}</button>
                <button class="icon-btn" data-slider-down="${esc(slider.id)}" aria-label="Descendre" ${index === sliders.length - 1 ? 'disabled' : ''}>${icon('chevron-down', 18)}</button>
                <button class="icon-btn" data-edit-slider="${esc(slider.id)}" aria-label="Modifier">${icon('edit', 16)}</button>
                <button class="icon-btn btn-icon-danger" data-delete-slider="${esc(slider.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
              </div>
            </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function bindAdminSliders() {
    document.getElementById('add-slider').addEventListener('click', () => sliderForm(null));
    $$('[data-edit-slider]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pool = (state.adminData && state.adminData.sliders) || state.content.sliders;
        const slider = pool.find((s) => s.id === btn.dataset.editSlider);
        sliderForm(slider);
      });
    });
    $$('[data-delete-slider]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer cette image ?', 'Le slider doit conserver au moins 5 images.', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/sliders/${btn.dataset.deleteSlider}`);
          toast('Image supprimée.', 'success');
          await refreshContent();
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    const reorder = async (id, direction) => {
      const sliders = state.content.sliders.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = sliders.findIndex((s) => s.id === id);
      const target = index + direction;
      if (target < 0 || target >= sliders.length) return;
      [sliders[index], sliders[target]] = [sliders[target], sliders[index]];
      try {
        await T.api.post('/api/admin/sliders/reorder', { ids: sliders.map((s) => s.id) });
        await refreshContent();
        loadAdminSection();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    $$('[data-slider-up]').forEach((btn) => {
      btn.addEventListener('click', () => reorder(btn.dataset.sliderUp, -1));
    });
    $$('[data-slider-down]').forEach((btn) => {
      btn.addEventListener('click', () => reorder(btn.dataset.sliderDown, 1));
    });
  }

  function sliderForm(slider) {
    const body = `<form id="slider-form" class="form">
      <div class="field"><label>Image</label>
        <div class="upload-row">
          <input id="sl-image" type="text" value="${esc(slider ? slider.src : '')}" placeholder="/img/slider/slide1.jpg" />
          <label class="btn btn-outline btn-sm upload-btn" for="sl-file">${icon('upload', 15)} Importer</label>
          <input id="sl-file" type="file" accept="image/*" hidden />
        </div>
        <img id="sl-preview" class="img-preview ${slider ? '' : 'hidden'}" src="${esc(slider ? slider.src : '')}" alt="" />
        <p class="form-hint">Images compressées recommandées (1600 × 900 px, JPEG ou WebP).</p>
      </div>
      <div class="field"><label for="sl-caption">Légende principale</label><input id="sl-caption" required value="${esc(slider ? slider.caption : '')}" placeholder="Votre véhicule, pris en charge jusqu’au port" /></div>
      <div class="field"><label for="sl-sub">Sous-titre</label><input id="sl-sub" value="${esc(slider ? slider.sub : '')}" placeholder="Ro-Ro régulier vers l’Europe…" /></div>
    </form>`;
    modal({
      title: slider ? 'Modifier l’image du slider' : 'Ajouter une image au slider',
      body,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Annuler</button><button class="btn btn-primary" type="button" data-save>${icon('save', 17)} Enregistrer</button>`,
      onOpen: (modalEl, close) => {
        modalEl.querySelector('[data-cancel]').addEventListener('click', close);
        const fileInput = modalEl.querySelector('#sl-file');
        const imageInput = modalEl.querySelector('#sl-image');
        const preview = modalEl.querySelector('#sl-preview');
        fileInput.addEventListener('change', () => {
          const file = fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            preview.src = reader.result;
            preview.classList.remove('hidden');
          };
          reader.readAsDataURL(file);
        });
        modalEl.querySelector('[data-save]').addEventListener('click', async () => {
          const button = modalEl.querySelector('[data-save]');
          setLoading(button, true, 'Enregistrement…');
          try {
            let image = imageInput.value.trim();
            if (fileInput.files[0]) image = await uploadImage(fileInput.files[0]);
            if (!image) throw new Error('Choisissez une image.');
            const payload = {
              src: image,
              caption: document.getElementById('sl-caption').value.trim(),
              sub: document.getElementById('sl-sub').value.trim(),
            };
            if (slider) await T.api.put(`/api/admin/sliders/${slider.id}`, payload);
            else await T.api.post('/api/admin/sliders', payload);
            close();
            toast('Image enregistrée.', 'success');
            await refreshContent();
            loadAdminSection();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminServicesHtml(services) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Services</h2><p>${services.length} service(s) proposés</p></div>
        <button class="btn btn-primary btn-sm" id="add-service" type="button">${icon('plus', 16)} Nouveau service</button>
      </div>
      <div class="admin-service-grid">
        ${services
          .map(
            (s) => `<div class="admin-service-card">
              <span class="service-icon">${esc(s.icon || '🚚')}</span>
              <div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div>
              <div class="row-actions">
                <button class="icon-btn" data-edit-service="${esc(s.id)}" aria-label="Modifier">${icon('edit', 16)}</button>
                <button class="icon-btn btn-icon-danger" data-delete-service="${esc(s.id)}" aria-label="Supprimer">${icon('trash', 16)}</button>
              </div>
            </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function bindAdminServices() {
    document.getElementById('add-service').addEventListener('click', () => serviceForm(null));
    $$('[data-edit-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pool = (state.adminData && state.adminData.services) || state.content.services;
        const service = pool.find((s) => s.id === btn.dataset.editService);
        serviceForm(service);
      });
    });
    $$('[data-delete-service]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce service ?', 'Il disparaîtra de la page « Autres services ».', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/services/${btn.dataset.deleteService}`);
          toast('Service supprimé.', 'success');
          await refreshContent();
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function serviceForm(service) {
    const body = `<form id="service-form" class="form">
      <div class="field-grid two">
        <div class="field"><label for="svf-name">Nom du service</label><input id="svf-name" required value="${esc(service ? service.name : '')}" placeholder="Transport routier" /></div>
        <div class="field"><label for="svf-icon">Icône <span class="label-optional">emoji</span></label><input id="svf-icon" maxlength="4" value="${esc(service ? service.icon : '')}" placeholder="🚛" /></div>
      </div>
      <div class="field"><label for="svf-description">Description</label><textarea id="svf-description" rows="3">${esc(service ? service.description : '')}</textarea></div>
    </form>`;
    modal({
      title: service ? 'Modifier le service' : 'Nouveau service',
      body,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>Annuler</button><button class="btn btn-primary" type="button" data-save>${icon('save', 17)} Enregistrer</button>`,
      onOpen: (modalEl, close) => {
        modalEl.querySelector('[data-cancel]').addEventListener('click', close);
        modalEl.querySelector('[data-save]').addEventListener('click', async () => {
          const button = modalEl.querySelector('[data-save]');
          setLoading(button, true, 'Enregistrement…');
          try {
            const payload = {
              name: document.getElementById('svf-name').value.trim(),
              icon: document.getElementById('svf-icon').value.trim() || '🚚',
              description: document.getElementById('svf-description').value.trim(),
              active: true,
            };
            if (service) await T.api.put(`/api/admin/services/${service.id}`, payload);
            else await T.api.post('/api/admin/services', payload);
            close();
            toast('Service enregistré.', 'success');
            await refreshContent();
            loadAdminSection();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(button, false);
          }
        });
      },
    });
  }

  function adminUsersHtml(users) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Utilisateurs</h2><p>${users.length} compte(s)</p></div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Utilisateur</th><th>Coordonnées</th><th>Rôle</th><th>Demandes</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${users
            .map(
              (user) => `<tr>
                <td><div class="user-cell"><span class="avatar">${esc(initials(user.name))}</span><div><strong>${esc(user.name)}</strong><small>Membre depuis ${fmtDate(user.createdAt, false)}</small></div></div></td>
                <td>${esc(user.email || '—')}<small>${esc(user.phone || '')}</small></td>
                <td>
                  <select data-role-user="${esc(user.id)}" ${user.id === state.user.id ? 'disabled' : ''}>
                    <option value="client" ${user.role === 'client' ? 'selected' : ''}>Client</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrateur</option>
                  </select>
                </td>
                <td>${user.quoteCount}</td>
                <td>${user.active ? '<span class="status-pill status-open"><span class="dot"></span>Actif</span>' : '<span class="status-pill status-refused"><span class="dot"></span>Désactivé</span>'}</td>
                <td><div class="row-actions">
                  <button class="btn btn-outline btn-xs" data-toggle-user="${esc(user.id)}" ${user.id === state.user.id ? 'disabled' : ''}>${user.active ? 'Désactiver' : 'Activer'}</button>
                  <button class="icon-btn btn-icon-danger" data-delete-user="${esc(user.id)}" ${user.id === state.user.id || user.role === 'admin' ? 'disabled' : ''} aria-label="Supprimer">${icon('trash', 16)}</button>
                </div></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function bindAdminUsers() {
    $$('[data-role-user]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await T.api.put(`/api/admin/users/${select.dataset.roleUser}`, { role: select.value });
          toast('Rôle mis à jour.', 'success');
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    $$('[data-toggle-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const response = await T.api.get('/api/admin/users');
        const target = response.users.find((u) => u.id === button.dataset.toggleUser);
        if (!target) return;
        try {
          await T.api.put(`/api/admin/users/${target.id}`, { active: !target.active });
          toast(target.active ? 'Compte désactivé.' : 'Compte activé.', 'success');
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    $$('[data-delete-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('Supprimer ce compte ?', 'Cette action est définitive.', { confirmLabel: 'Supprimer' }))) return;
        try {
          await T.api.del(`/api/admin/users/${button.dataset.deleteUser}`);
          toast('Compte supprimé.', 'success');
          loadAdminSection();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function adminNotificationsHtml(notifications) {
    return `<div class="panel">
      <div class="panel-head">
        <div><h2>Notifications</h2><p>${notifications.filter((n) => !n.read).length} non lue(s)</p></div>
        <button class="btn btn-outline btn-sm" id="read-all" type="button">${icon('check', 16)} Tout marquer comme lu</button>
      </div>
      ${
        notifications.length
          ? `<div class="notification-list">${notifications
              .map(
                (n) => `<button class="notification-row ${n.read ? '' : 'unread'}" type="button" data-admin-notification="${esc(n.id)}" data-notification-quote="${esc(n.quoteId || '')}">
                  <span class="notification-dot"></span>
                  <div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${fmtDateTime(n.createdAt)}</small></div>
                  ${icon('chevron-right', 18)}
                </button>`
              )
              .join('')}</div>`
          : emptyState('bell', 'Aucune notification', 'Les nouvelles demandes apparaîtront ici.')
      }
    </div>`;
  }

  function bindAdminNotifications() {
    document.getElementById('read-all').addEventListener('click', async () => {
      try {
        await T.api.post('/api/admin/notifications/read-all', {});
        toast('Notifications marquées comme lues.', 'success');
        updateAdminBadge();
        loadAdminSection();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    $$('[data-admin-notification]').forEach((row) => {
      row.addEventListener('click', async () => {
        try {
          await T.api.post(`/api/admin/notifications/${row.dataset.adminNotification}/read`, {});
        } catch (err) {
          /* noop */
        }
        row.classList.remove('unread');
        updateAdminBadge();
        if (row.dataset.notificationQuote) openQuoteModalById(row.dataset.notificationQuote);
        else loadAdminSection();
      });
    });
  }

  /* -------------------------------- Router ------------------------------- */

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const [pathPart, query] = raw.split('?');
    const params = {};
    new URLSearchParams(query || '').forEach((value, key) => {
      params[key] = value;
    });
    return { path: pathPart || 'home', params };
  }

  function route() {
    cleanupPage();
    const { path, params } = parseHash();
    const isAdmin = state.user && state.user.role === 'admin';

    if (path === 'login') return renderLogin(params);
    if (path === 'reset') return renderReset(params);
    if (!state.user && !state.visitor) return renderLogin();
    if (path === 'home' || path === '') return renderHome();
    if (path === 'roro') return renderRoro(params);
    if (path === 'containers') return renderContainers(params);
    if (path === 'services') return renderServices();
    if (path.startsWith('service/')) return renderServiceQuote(path.split('/')[1]);
    if (path === 'account') return renderAccount();
    if (path === 'confirmation') return renderConfirmation();
    if (path === 'admin' || path.startsWith('admin/')) {
      if (!isAdmin) return renderLogin({ admin: true });
      return renderAdmin(path.split('/')[1] || 'dashboard');
    }
    return renderHome();
  }

  async function boot() {
    try {
      const me = await T.api.get('/api/auth/me');
      state.user = me.user;
    } catch (err) {
      state.user = null;
    }
    try {
      state.content = await T.api.get('/api/content');
    } catch (err) {
      document.getElementById('app').innerHTML = `<div class="error-page">${emptyState(
        'alert',
        'Serveur indisponible',
        'Impossible de charger les données de l’application. Vérifiez que le serveur est démarré.',
        '<button class="btn btn-primary" onclick="location.reload()">Réessayer</button>'
      )}</div>`;
      return;
    }
    if (!location.hash) {
      location.hash = state.user || state.visitor ? '#/home' : '#/login';
    } else {
      route();
    }
    window.addEventListener('hashchange', route);
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  boot();
})();
