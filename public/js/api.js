'use strict';

window.T = window.T || {};

T.api = {
  /* Dans l'application Android (Capacitor), l'interface est servie localement et
     l'API reste sur le serveur : l'URL de base est injectée au moment du build
     (scripts/build-android.js) et vaut '' sur le site web. */
  base() {
    return (typeof window !== 'undefined' && window.T_API_BASE) || '';
  },

  async request(method, url, body) {
    /* Si une base Supabase est configurée, l'application n'utilise plus le
       serveur Node : chaque appel est traduit en requêtes Supabase. */
    if (window.T && T.apiSupabase && T.apiSupabase.configured()) {
      return T.apiSupabase.request(method, url, body);
    }
    const target = url.startsWith('http') ? url : `${T.api.base()}${url}`;
    const options = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(target, options);
    } catch (err) {
      throw new Error('Connexion impossible. Vérifiez votre accès à Internet.');
    }
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    if (!response.ok || (data && data.ok === false)) {
      const message = (data && data.message) || `Erreur ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  },
  get(url) {
    return T.api.request('GET', url);
  },
  post(url, body) {
    return T.api.request('POST', url, body);
  },
  put(url, body) {
    return T.api.request('PUT', url, body);
  },
  patch(url, body) {
    return T.api.request('PATCH', url, body);
  },
  del(url) {
    return T.api.request('DELETE', url);
  },
};
