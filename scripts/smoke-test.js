'use strict';

/* Smoke test jsdom : charge l'application, passe en visiteur et parcourt les pages. */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
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
      window.fetch = (url, options) => fetch(new URL(url, BASE).href, options);
      window.scrollTo = () => {};
    },
  });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const app = () => window.document.getElementById('app');
  console.log('Title:', window.document.title);
  console.log('Login rendered:', /login-shell/.test(app().innerHTML), /Continuer en visiteur/.test(app().innerHTML));

  const visitor = window.document.getElementById('btn-visitor');
  if (!visitor) throw new Error('Bouton visiteur introuvable');
  visitor.click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log('Hash after visitor:', window.location.hash);
  console.log('Home rendered:', /hero-slider|hero-fallback/.test(app().innerHTML), /Prochains départs/.test(app().innerHTML));
  console.log('Departures cards:', window.document.querySelectorAll('.departure-card').length);
  console.log('Slides:', window.document.querySelectorAll('.slide').length);

  async function go(hash, label) {
    window.location.hash = hash;
    await new Promise((resolve) => setTimeout(resolve, 900));
    const html = app().innerHTML;
    console.log(`${label} (${hash}):`, html.length, 'chars', /loading-block/.test(html) ? 'LOADING' : 'OK');
  }

  await go('#/roro', 'Ro-Ro');
  console.log('Roro form:', !!window.document.getElementById('roro-form'), 'map:', !!window.document.getElementById('roro-map'));
  await go('#/containers', 'Conteneurs');
  console.log('Container cards:', window.document.querySelectorAll('.container-card').length, 'form:', !!window.document.getElementById('container-form-el'));
  await go('#/services', 'Services');
  await go('#/service/svc_dedouanement', 'Service quote');
  await go('#/account', 'Account');
  console.log('Account redirects to login:', /login-shell/.test(app().innerHTML));
  await go('#/home', 'Home again');

  if (errors.length) {
    console.log('\nErreurs JS :');
    for (const error of errors) console.log(' -', error);
    process.exitCode = 1;
  } else {
    console.log('\nAucune erreur JavaScript détectée.');
  }
  window.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
