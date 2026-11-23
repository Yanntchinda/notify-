'use strict';

window.T = window.T || {};

T.api = {
  /* Retour au serveur Node de développement quand aucune base Supabase n'est
     configurée : l'URL de base vaut '' (même origine). */
  base() {
    return (typeof window !== 'undefined' && window.T_API_BASE) || '';
  },

  async request(method, url, body) {
    try {
      /* Si une base Supabase est configurée, l'application n'utilise plus le
         serveur Node : chaque appel est traduit en requêtes Supabase. */
      if (window.T && T.apiSupabase && T.apiSupabase.configured()) {
        return await T.apiSupabase.request(method, url, body);
      }
      return await T.api.rest(method, url, body);
    } catch (err) {
      /* Aucune base joignable : on affiche le contenu de démonstration embarqué
         pour que l'application reste présentable (APK, hors ligne, première
         installation). Les demandes de devis restent impossibles : un message
         clair le signale. */
      if (method === 'GET' && url === '/api/content') {
        const demo = await T.api.demoContent();
        if (demo) return demo;
      }
      throw err;
    }
  },

  /* Contenu de démonstration embarqué (public/data/demo-content.json). */
  demoMode: false,
  _demoPromise: null,
  demoContent() {
    if (!T.api._demoPromise) {
      T.api._demoPromise = fetch(`${T.api.base()}/data/demo-content.json`)
        .then((response) => (response.ok ? response.json() : null))
        .then((content) => {
          if (!content) return null;
          T.api.demoMode = true;
          return content;
        })
        .catch(() => null);
    }
    return T.api._demoPromise;
  },

  async rest(method, url, body) {
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
      throw new Error(
        window.APP_CONFIG
          ? 'Base de données non configurée : renseignez supabaseUrl et supabaseAnonKey dans public/js/config.js.'
          : 'Connexion impossible. Vérifiez votre accès à Internet.'
      );
    }
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    /* Toute réponse non JSON (page HTML d'un hébergement statique, fichier
       manquant dans l'application installée) est une erreur : sans ça, on
       renverrait null et l'interface planterait. */
    if (data === null) {
      throw new Error(
        window.APP_CONFIG
          ? 'Base de données non configurée : renseignez supabaseUrl et supabaseAnonKey dans public/js/config.js.'
          : 'API indisponible. Lancez « npm start » ou configurez Supabase.'
      );
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
