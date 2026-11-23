'use strict';

window.T = window.T || {};

(function () {
  const esc = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const ICONS = {
    home: '<path d="M3 10.7 12 3l9 7.7"/><path d="M5 9.6V21h14V9.6"/><path d="M9.5 21v-6h5v6"/>',
    ship: '<path d="M3 17c1.6 0 1.6 1 3.2 1s1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1"/><path d="M4.5 17 6 9.5h12L19.5 17"/><path d="M9 9.5V5h6l1.5 4.5"/><path d="M12 5V3"/>',
    container: '<rect x="3" y="7" width="18" height="13" rx="1.2"/><path d="M3 11h18M9 7v13M15 7v13"/><path d="M6.5 4v3M17.5 4v3"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    navigation: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4M10 6l-6 6 6 6"/>',
    'chevron-left': '<path d="m14.5 5-7 7 7 7"/>',
    'chevron-right': '<path d="m9.5 5 7 7-7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    phone: '<path d="M7 3.5 9.5 8l-2 1.5c1 2.4 2.6 4 5 5L14 12.5 18.5 15 17 19c-.4 1.1-1.6 1.6-2.7 1.2C8.9 18.4 5.6 15.1 3.8 9.7 3.4 8.6 3.9 7.4 5 7L7 3.5Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    logout: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="M15 8l4 4-4 4M9 12h10"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13 5 4 4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4l3 3v4h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h5a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h5"/>',
    eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    dashboard: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    inbox: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l1.5 3h5L16 13h4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-3 5 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.6 1Z"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 4l3 3M14 7l3 3"/>',
    save: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    whatsapp: '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.5 7.5L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.6Z"/><path d="M8.5 8.2c.2-.5.5-.5.8-.5h.6c.2 0 .4 0 .6.5l.8 1.8c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.9 1.3 1.6 2.2 2.1.3.2.4.1.6-.1l.6-.7c.2-.2.4-.3.6-.2l1.7.8c.3.1.4.3.4.5 0 .8-.4 1.5-1 1.8-.5.3-1.2.4-2 .2-2.5-.6-4.5-2.4-5.4-4.7-.4-.9-.4-1.8 0-2.4Z"/>',
    'map-pin': '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    send: '<path d="m3.5 11.5 17-8-8 17-2.5-7-6.5-2Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  };

  function icon(name, size = 20, className = '') {
    const path = ICONS[name] || ICONS.info;
    return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  const QUOTE_STATUS = {
    received: { label: 'Reçue', cls: 'received' },
    processing: { label: 'En cours', cls: 'processing' },
    quoted: { label: 'Cotation envoyée', cls: 'quoted' },
    accepted: { label: 'Acceptée', cls: 'accepted' },
    refused: { label: 'Refusée', cls: 'refused' },
  };

  const DEPARTURE_STATUS = {
    open: { label: 'Ouvert', cls: 'open' },
    full: { label: 'Complet', cls: 'full' },
    departed: { label: 'Parti', cls: 'departed' },
  };

  const QUOTE_TYPE = {
    roro: { label: 'Ro-Ro', cls: 'roro', icon: 'ship' },
    container: { label: 'Conteneur', cls: 'container', icon: 'container' },
    service: { label: 'Autre service', cls: 'service', icon: 'grid' },
  };

  function statusPill(status) {
    const meta = QUOTE_STATUS[status] || { label: status || 'Inconnu', cls: 'received' };
    return `<span class="status-pill status-${meta.cls}"><span class="dot"></span>${esc(meta.label)}</span>`;
  }

  function departurePill(status) {
    const meta = DEPARTURE_STATUS[status] || { label: status || 'Ouvert', cls: 'open' };
    return `<span class="status-pill status-${meta.cls}"><span class="dot"></span>${esc(meta.label)}</span>`;
  }

  function typeBadge(type) {
    const meta = QUOTE_TYPE[type] || { label: type, cls: 'service', icon: 'grid' };
    return `<span class="type-badge type-${meta.cls}">${icon(meta.icon, 14)}${esc(meta.label)}</span>`;
  }

  function fmtDate(value, withYear = true) {
    if (!value) return '—';
    const date = new Date(String(value).length === 10 ? `${value}T12:00:00Z` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: withYear ? 'numeric' : undefined,
    });
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function flag(countryCode) {
    const code = String(countryCode || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return '';
    return code
      .split('')
      .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
      .join('');
  }

  function fmtNumber(value, digits = 1) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(value));
  }

  function toast(message, type = 'info') {
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';
    el.innerHTML = `${icon(iconName, 20)}<span>${esc(message)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 4500);
  }

  let modalKeyHandler = null;
  let modalCloseHandler = null;

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
    if (modalCloseHandler) {
      const handler = modalCloseHandler;
      modalCloseHandler = null;
      handler();
    }
  }

  function modal({ title, body, footer = '', wide = false, onOpen, onClose }) {
    closeModal();
    const root = document.getElementById('modal-root');
    if (!root) return () => {};
    root.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal-head">
            <h2>${esc(title)}</h2>
            <button type="button" class="icon-btn" data-modal-close aria-label="Fermer">${icon('x', 20)}</button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>`;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      const backdrop = root.querySelector('.modal-backdrop');
      if (backdrop) backdrop.classList.add('open');
    });
    const close = () => closeModal();
    const closeBtn = root.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const backdrop = root.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
      });
    }
    modalKeyHandler = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', modalKeyHandler);
    if (onClose) modalCloseHandler = onClose;
    if (onOpen) onOpen(root.querySelector('.modal'), close);
    return close;
  }

  function confirmDialog(title, message, { danger = true, confirmLabel = 'Supprimer' } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(value);
      };
      modal({
        title,
        body: `<p class="modal-message">${esc(message)}</p>`,
        footer: `
          <button type="button" class="btn btn-ghost" data-confirm-cancel>Annuler</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${esc(confirmLabel)}</button>`,
        onOpen: (el) => {
          el.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
          el.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
        },
        onClose: () => finish(false),
      });
    });
  }

  function setLoading(button, isLoading, label = 'Chargement…') {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.label) button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.label) {
        button.innerHTML = button.dataset.label;
        delete button.dataset.label;
      }
    }
  }

  function loading(label = 'Chargement…') {
    return `<div class="loading-block"><span class="spinner spinner-lg"></span><span>${esc(label)}</span></div>`;
  }

  function emptyState(iconName, title, text, actionHtml = '') {
    return `<div class="empty-state">${icon(iconName, 34)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
  }

  function option(value, label, selected) {
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }

  function debounce(fn, wait = 300) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  T.ui = {
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
  };
})();
