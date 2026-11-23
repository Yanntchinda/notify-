'use strict';

window.T = window.T || {};

T.api = {
  /* Retour au serveur Node de développement quand aucune base Supabase n'est
     configurée : l'URL de base vaut '' (même origine). */
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
    /* Un hébergement statique sans serveur Node renvoie la page HTML au lieu
       d'une réponse JSON : on le signale clairement plutôt que d'afficher «Erreur 404». */
    if (data === null && (response.status === 404 || response.status === 503)) {
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
